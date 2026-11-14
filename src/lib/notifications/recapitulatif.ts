import type { DepotFamille } from "../domaine/depot";
import type { DateJour, Famille } from "../domaine/types";
import { clesPeriode } from "../ia/plafond";
import type { ClientGemini } from "../ia/types";
import { ajouterJours } from "../regles/dates";
import type { DepotTaches } from "../taches/depot";
import { tachesPourAdulte } from "../taches/vues";
import { HEURE_RECAPITULATIF_DEFAUT, MAX_RECAPITULATIFS_PAR_JOUR } from "./configuration";
import type { StockagePreferences } from "./preferences";
import { LONGUEUR_MAX_TEXTE, TITRE, texteCourt } from "./service";
import {
  AbonnementExpire,
  type ContenuPush,
  type ElementRegroupe,
  type EnvoyeurPush,
  type FileRegroupement,
  type StockageAbonnements,
  type StockageCompteurNotifications,
} from "./types";

export type ResultatRecapitulatif =
  | { statut: "envoye"; texte: string; source: "gemini" | "repli"; appareils: number }
  | { statut: "desactive" }
  | { statut: "pas_encore" }
  | { statut: "deja_envoye" }
  | { statut: "rien_a_dire" }
  | { statut: "aucun_abonnement" }
  | { statut: "echec_envoi" }
  | { statut: "erreur" };

export interface DependancesRecapitulatif {
  depot: DepotFamille;
  taches: DepotTaches;
  abonnements: StockageAbonnements;
  envoyeur: EnvoyeurPush;
  gemini: ClientGemini;
  file: FileRegroupement;
  preferences: StockagePreferences;
  /**
   * Compteur des récapitulatifs, distinct de celui des notifications : le récapitulatif ne compte pas dans le
   * plafond de 10, mais `MAX_RECAPITULATIFS_PAR_JOUR` (1) est appliqué ici, côté serveur, par destinataire.
   */
  envois: StockageCompteurNotifications;
  /** HH:MM (Europe/Paris) utilisée quand l'adulte n'a rien réglé. */
  heureParDefaut?: string;
}

/** Jour (AAAA-MM-JJ) et heure (HH:MM) à Paris. */
function dateHeureParis(d: Date): { jour: DateJour; heure: string } {
  const jour = clesPeriode(d).jour.slice("jour:".length);
  const parties = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const v = (t: string) => parties.find((p) => p.type === t)?.value ?? "00";
  return { jour, heure: `${v("hour")}:${v("minute")}` };
}

/** Le dépôt de tâches vu depuis le lendemain : « aujourd'hui » devient demain pour `tachesPourAdulte`. */
function tachesALaDate(depot: DepotTaches, date: DateJour): DepotTaches {
  return {
    aujourdhui: () => date,
    lister: () => depot.lister(),
    enregistrer: (a, t) => depot.enregistrer(a, t),
    supprimer: (a, id) => depot.supprimer(a, id),
    cocher: (a, id, d) => depot.cocher(a, id, d),
    decocher: (a, id, d) => depot.decocher(a, id, d),
  };
}

interface Contenu {
  lignes: string[];
  repli: string;
}

export class RecapitulatifService {
  constructor(private readonly d: DependancesRecapitulatif) {}

  /** À appeler toutes les 15 minutes. Un adulte en erreur n'empêche pas l'autre ; aucune exception ne remonte par adulte. */
  async envoyerRecapitulatifs(maintenant: Date): Promise<Record<string, ResultatRecapitulatif>> {
    const famille = await this.d.depot.lireFamille();
    const resultats: Record<string, ResultatRecapitulatif> = {};
    for (const adulte of famille.adultes) {
      try {
        resultats[adulte.id] = await this.pour(famille, adulte.id, maintenant);
      } catch (e) {
        console.error("[recapitulatif] échec pour un adulte", e instanceof Error ? e.name : "inconnue");
        resultats[adulte.id] = { statut: "erreur" };
      }
    }
    return resultats;
  }

  private async pour(famille: Famille, adulteId: string, maintenant: Date): Promise<ResultatRecapitulatif> {
    const prefs = (await this.d.preferences.lire(adulteId)) ?? { actif: true, heure: this.d.heureParDefaut ?? HEURE_RECAPITULATIF_DEFAUT };
    if (!prefs.actif) return { statut: "desactive" };
    const { jour, heure } = dateHeureParis(maintenant);
    if (heure < prefs.heure) return { statut: "pas_encore" };

    const cle = `recap:${adulteId}:${jour}`;
    if ((await this.d.envois.lire(cle)) >= MAX_RECAPITULATIFS_PAR_JOUR) return { statut: "deja_envoye" };
    const appareils = await this.d.abonnements.lister(adulteId);
    if (appareils.length === 0) return { statut: "aucun_abonnement" };
    const demain = ajouterJours(jour, 1);
    const apercu = await this.contenu(famille, adulteId, demain, await this.d.file.lister(adulteId));
    if (apercu.lignes.length === 0) return { statut: "rien_a_dire" };

    // Réservation atomique de l'unique récapitulatif du jour, avant toute lecture destructive ou envoi.
    if (!(await this.d.envois.reserver(cle, MAX_RECAPITULATIFS_PAR_JOUR))) return { statut: "deja_envoye" };
    let regroupes: ElementRegroupe[] = [];
    let livres = 0;
    try {
      regroupes = await this.d.file.vider(adulteId);
      const contenu = await this.contenu(famille, adulteId, demain, regroupes);
      if (contenu.lignes.length === 0) {
        await this.remettre(cle, regroupes);
        return { statut: "rien_a_dire" };
      }
      const { texte, source } = await this.rediger(contenu);
      const push: ContenuPush = { titre: TITRE, corps: texte };
      for (const a of appareils) {
        try {
          await this.d.envoyeur.envoyer(a, push);
          livres++;
        } catch (e) {
          if (e instanceof AbonnementExpire) await this.d.abonnements.retirer(adulteId, a.endpoint).catch(() => undefined);
        }
      }
      if (livres === 0) {
        await this.remettre(cle, regroupes);
        return { statut: "echec_envoi" };
      }
      return { statut: "envoye", texte, source, appareils: livres };
    } catch (e) {
      if (livres === 0) await this.remettre(cle, regroupes);
      throw e;
    }
  }

  /** Rien n'a été livré : la place du jour et les éléments regroupés sont rendus pour le prochain passage. */
  private async remettre(cle: string, regroupes: ElementRegroupe[]) {
    for (const e of regroupes) await this.d.file.ajouter(e);
    await this.d.envois.liberer(cle);
  }

  private async contenu(famille: Famille, adulteId: string, demain: DateJour, regroupes: ElementRegroupe[]): Promise<Contenu> {
    const filtre = { du: demain, au: demain };
    const [gardes, presences, transferts, creneaux, vue] = await Promise.all([
      this.d.depot.listerGardes(filtre),
      this.d.depot.listerPresences(filtre),
      this.d.depot.listerTransferts(filtre),
      this.d.depot.listerCreneaux(filtre),
      // Vue de CET adulte uniquement : le retard de l'autre n'est ni calculé ni montré.
      tachesPourAdulte(tachesALaDate(this.d.taches, demain), famille, adulteId),
    ]);
    const enfant = (id: string) => famille.enfants.find((e) => e.id === id)?.prenom ?? "un enfant";
    const adulte = (id: string) => famille.adultes.find((a) => a.id === id)?.prenom ?? "un adulte";
    const lieu = (id: string) => famille.lieux.find((l) => l.id === id)?.libelle ?? "un lieu";
    // « aujourdhui » de la vue décalée = demain ; seules ses propres tâches (défense en profondeur).
    const mesTaches = vue.aujourdhui.filter((o) => !o.deLAutre && o.assigneId === adulteId && o.date === demain);

    const lignes = [
      ...gardes.map((g) => `${enfant(g.enfantId)} : garde de ${adulte(g.responsableId)}`),
      ...presences.map((p) => `${enfant(p.enfantId)} dort : ${lieu(p.lieuId)}`),
      ...transferts.map(
        (t) => `${t.heure} ${lieu(t.lieuId)} : ${adulte(t.deposeId)} dépose, ${adulte(t.recupereId)} récupère (${t.enfantIds.map(enfant).join(", ")})`,
      ),
      ...creneaux.map((c) => `${enfant(c.enfantId)} ${c.debut}-${c.fin} ${c.libelle}`),
      ...mesTaches.map((o) => `Tâche : ${o.titre}`),
      ...regroupes.map((r) => `Déjà signalé : ${r.texte}`),
    ];

    const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;
    const nbEnfants = new Set([...gardes.map((g) => g.enfantId), ...presences.map((p) => p.enfantId)]).size;
    const morceaux = [
      nbEnfants > 0 && pluriel(nbEnfants, "enfant au planning", "enfants au planning"),
      transferts.length > 0 && pluriel(transferts.length, "transfert", "transferts"),
      creneaux.length > 0 && pluriel(creneaux.length, "créneau", "créneaux"),
      mesTaches.length > 0 && pluriel(mesTaches.length, "tâche", "tâches"),
      regroupes.length > 0 && pluriel(regroupes.length, "notification regroupée", "notifications regroupées"),
    ].filter((m): m is string => m !== false);
    return { lignes, repli: texteCourt(`Demain : ${morceaux.join(", ")}.`) };
  }

  /** UN message court par Gemini ; repli sur le texte fixe si l'appel échoue (plafond IA compris) ou rend du vide. */
  private async rediger(contenu: Contenu): Promise<{ texte: string; source: "gemini" | "repli" }> {
    try {
      const { texte } = await this.d.gemini.rediger({
        consigne:
          `Écris UN seul message de récapitulatif de la journée de demain, en français, ${LONGUEUR_MAX_TEXTE} caractères au maximum, ` +
          "sans guillemets, sans nom de famille, sans adresse ni numéro, sans donnée de santé ou d'argent. N'invente rien.",
        contexte: contenu.lignes.join("\n"),
      });
      const court = texteCourt(texte);
      if (court) return { texte: court, source: "gemini" };
    } catch {
      // Repli ci-dessous.
    }
    return { texte: contenu.repli, source: "repli" };
  }
}
