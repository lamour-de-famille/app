import { clesPeriode } from "../ia/plafond";
import type { ClientGemini } from "../ia/types";
import { MAX_NOTIFICATIONS_PAR_JOUR_DEFAUT, type ConfigurationNotifications } from "./configuration";
import {
  AbonnementExpire,
  type ContenuPush,
  type DemandeNotification,
  type EnvoyeurPush,
  type FileRegroupement,
  type ResultatNotification,
  type StockageAbonnements,
  type StockageCompteurNotifications,
} from "./types";

export const LONGUEUR_MAX_TEXTE = 120;
export const TITRE = "L'amour de famille";
export const TEXTE_DE_REPLI = "Nouvelle information dans l'agenda de la famille.";

/** Une seule ligne, 120 caractères au plus (coupe sur un mot si possible, ajoute « … »). */
export function texteCourt(brut: string): string {
  const t = brut.replace(/\s+/g, " ").trim();
  if (t.length <= LONGUEUR_MAX_TEXTE) return t;
  const coupe = t.slice(0, LONGUEUR_MAX_TEXTE - 1);
  const espace = coupe.lastIndexOf(" ");
  return `${(espace > 60 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
}

export interface DependancesNotifications {
  abonnements: StockageAbonnements;
  envoyeur: EnvoyeurPush;
  gemini: ClientGemini;
  compteur: StockageCompteurNotifications;
  file: FileRegroupement;
  /** Absente : plafond par défaut (10). Fixée à la construction, jamais par appel. */
  configuration?: ConfigurationNotifications;
  maintenant?: () => Date;
  /** Marque l'événement comme notifié (DepotFamille.marquerNotifie) une fois envoyé ou regroupé. */
  marquerNotifie?: (destinataireId: string, evenementId: string) => Promise<void>;
}

export class ServiceNotifications {
  private readonly max: number;
  private readonly maintenant: () => Date;

  constructor(private readonly d: DependancesNotifications) {
    this.max = d.configuration?.maxParJour ?? MAX_NOTIFICATIONS_PAR_JOUR_DEFAUT;
    this.maintenant = d.maintenant ?? (() => new Date());
  }

  /**
   * Plafond par destinataire et par jour (Europe/Paris) appliqué ici : au-delà, rien n'est envoyé,
   * le texte est mis en file pour le récapitulatif. Seuls les appareils du destinataire sont visés.
   */
  async notifier(demande: DemandeNotification): Promise<ResultatNotification> {
    const { destinataireId, evenement } = demande;
    if (evenement && evenement.destinataireId !== destinataireId) {
      throw new Error("L'événement n'est pas destiné à ce destinataire.");
    }
    const jour = clesPeriode(this.maintenant()).jour.slice("jour:".length);
    const cle = `notif:${destinataireId}:${jour}`;

    // Réservation atomique avant tout envoi : des appels parallèles ne dépassent pas le plafond.
    if (!(await this.d.compteur.reserver(cle, this.max))) {
      // Pas d'appel à Gemini ici : la rédaction se fait au récapitulatif, le plafond IA reste intact.
      const texte = texteCourt(demande.sujet ?? "") || TEXTE_DE_REPLI;
      await this.d.file.ajouter({ destinataireId, jour, texte, evenementId: evenement?.id });
      await this.marquer(demande);
      return { statut: "regroupee", texte };
    }

    let livres = 0;
    try {
      const appareils = await this.d.abonnements.lister(destinataireId);
      if (appareils.length === 0) {
        await this.d.compteur.liberer(cle);
        return { statut: "aucun_abonnement" };
      }
      const { texte, source } = await this.rediger(demande);
      const contenu: ContenuPush = { titre: TITRE, corps: texte };
      for (const a of appareils) {
        try {
          await this.d.envoyeur.envoyer(a, contenu);
          livres++;
        } catch (e) {
          if (e instanceof AbonnementExpire) {
            try {
              await this.d.abonnements.retirer(destinataireId, a.endpoint);
            } catch {
              console.error("Notifications : retrait d'un abonnement expiré impossible.");
            }
          }
        }
      }
      if (livres === 0) {
        await this.d.compteur.liberer(cle);
        return { statut: "echec_envoi" };
      }
      try {
        await this.marquer(demande);
      } catch {
        // Déjà livrée : la place reste prise (pas de renvoi ni de dépassement du plafond).
        console.error("Notifications : marquage de l'événement impossible après envoi.");
      }
      return { statut: "envoyee", texte, source, appareils: livres };
    } catch (e) {
      if (livres === 0) await this.d.compteur.liberer(cle);
      throw e;
    }
  }

  private async marquer(demande: DemandeNotification) {
    if (demande.evenement && this.d.marquerNotifie) await this.d.marquerNotifie(demande.destinataireId, demande.evenement.id);
  }

  /** Gemini rédige ; repli sur un texte fixe si l'appel échoue (plafond IA atteint compris) ou rend du vide. */
  private async rediger(demande: DemandeNotification): Promise<{ texte: string; source: "gemini" | "repli" }> {
    const sujet = demande.sujet?.trim() ?? "";
    try {
      const { texte } = await this.d.gemini.rediger({
        consigne:
          `Écris une notification push en français, ${LONGUEUR_MAX_TEXTE} caractères au maximum, une seule phrase, ` +
          "sans guillemets, sans nom de famille, sans adresse ni numéro, sans donnée de santé ou d'argent.",
        contexte: sujet || "Un nouvel événement concerne l'agenda familial.",
      });
      const court = texteCourt(texte);
      if (court) return { texte: court, source: "gemini" };
    } catch {
      // Repli ci-dessous.
    }
    return { texte: TEXTE_DE_REPLI, source: "repli" };
  }
}
