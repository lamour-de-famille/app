import { randomBytes } from "node:crypto";
import { ErreurDomaine, type DepotFamille, type FiltrePeriode, type NouvelleDemande } from "../domaine/depot";
import { DepotMemoire, type EtatDepot, type NomCollection } from "../domaine/depot-memoire";
import type { Creneau, DateJour, Famille, Garde, Presence, Transfert } from "../domaine/types";
import type { Regle } from "../regles/types";
import { idDocumentValide, nettoyer, type Banque, type Donnees } from "./banque";

export interface OptionsDepotFirestore {
  /** Horloge injectable (tests). */
  maintenant?: () => Date;
  /** Générateur d'ids injectable (tests). Par défaut : triable par date de création, unique. */
  genererId?: (prefixe: string) => string;
}

const TOUTES: NomCollection[] = ["gardes", "presences", "transferts", "creneaux", "demandes", "regles", "journal", "evenements"];

/** Chemin de la collection d'une famille. */
export const cheminCollection = (familleId: string, nom: string) => `familles/${familleId}/${nom}`;

function idUnique(): (prefixe: string) => string {
  let n = 0;
  return (prefixe) => {
    const t = Date.now().toString(36).padStart(9, "0");
    const s = (n++ % 1679616).toString(36).padStart(4, "0");
    return `${prefixe}-${t}-${s}-${randomBytes(3).toString("hex")}`;
  };
}

/**
 * Dépôt Firestore. Pour garantir le même comportement que `DepotMemoire`, chaque opération charge dans
 * une transaction les collections utiles, exécute la logique du dépôt en mémoire, puis écrit seulement
 * les documents modifiés, le journal et les événements, dans la même transaction (tout ou rien).
 * Convient à un volume familial ; un index d'accès par période serait la première optimisation.
 *
 * Données : `familles/{familleId}` (la famille) et `familles/{familleId}/{collection}/{id}`.
 */
export class DepotFirestore implements DepotFamille {
  private readonly genererId: (prefixe: string) => string;

  constructor(
    private readonly banque: Banque,
    private readonly familleId: string,
    private readonly options: OptionsDepotFirestore = {},
  ) {
    if (!idDocumentValide(familleId)) throw new ErreurDomaine(`Identifiant de famille invalide : ${familleId}`);
    this.genererId = options.genererId ?? idUnique();
  }

  /**
   * Crée le document de la famille (amorçage), validée comme à la construction d'un dépôt.
   * Refuse d'écraser une famille existante : ses gardes et son journal en dépendent.
   */
  async initialiserFamille(famille: Famille) {
    new DepotMemoire({ ...famille, id: this.familleId });
    await this.banque.transaction(async (tx) => {
      if (await tx.lire("familles", this.familleId)) throw new ErreurDomaine(`Famille déjà initialisée : ${this.familleId}`);
      tx.ecrire("familles", this.familleId, { ...famille, id: this.familleId });
    });
  }

  /** Lecture pure : transaction en lecture seule, aucune écriture possible. */
  private lire<T>(charger: NomCollection[], travail: (d: DepotMemoire) => Promise<T>): Promise<T> {
    return this.executer(charger, travail, true);
  }

  private async executer<T>(charger: NomCollection[], travail: (d: DepotMemoire) => Promise<T>, lectureSeule = false): Promise<T> {
    return this.banque.transaction(async (tx) => {
      const doc = await tx.lire("familles", this.familleId);
      if (!doc) throw new ErreurDomaine(`Famille introuvable : ${this.familleId}`);
      const avant: Partial<EtatDepot> = {};
      for (const nom of charger) {
        const docs = await tx.lister(cheminCollection(this.familleId, nom));
        (avant as Record<string, Record<string, unknown>>)[nom] = Object.fromEntries(docs.map((d) => [d.id, d.donnees]));
      }
      const depot = new DepotMemoire(doc as unknown as Famille, {
        maintenant: this.options.maintenant,
        genererId: this.genererId,
      });
      depot.restaurerEtat(avant);
      const resultat = await travail(depot);
      if (lectureSeule) return resultat;
      const apres = depot.exporterEtat();
      for (const nom of TOUTES) {
        const ancien = (avant[nom] ?? {}) as Record<string, unknown>;
        const nouveau = nettoyer(apres[nom]) as Record<string, unknown>;
        const chemin = cheminCollection(this.familleId, nom);
        for (const [id, valeur] of Object.entries(nouveau)) {
          if (JSON.stringify(ancien[id]) === JSON.stringify(valeur)) continue;
          if (!idDocumentValide(id)) throw new ErreurDomaine(`Identifiant invalide : ${id}`);
          tx.ecrire(chemin, id, valeur as Donnees);
        }
        for (const id of Object.keys(ancien)) if (!(id in nouveau)) tx.supprimer(chemin, id);
      }
      return resultat;
    }, { lectureSeule });
  }

  lireFamille() {
    return this.lire([], (d) => d.lireFamille());
  }

  listerGardes(f?: FiltrePeriode) {
    return this.lire(["gardes"], (d) => d.listerGardes(f));
  }
  definirGarde(auteurId: string, garde: Garde) {
    return this.executer(["gardes"], (d) => d.definirGarde(auteurId, garde));
  }
  supprimerGarde(auteurId: string, enfantId: string, date: DateJour) {
    return this.executer(["gardes"], (d) => d.supprimerGarde(auteurId, enfantId, date));
  }

  listerPresences(f?: FiltrePeriode) {
    return this.lire(["presences"], (d) => d.listerPresences(f));
  }
  definirPresence(auteurId: string, presence: Presence) {
    return this.executer(["presences"], (d) => d.definirPresence(auteurId, presence));
  }
  supprimerPresence(auteurId: string, enfantId: string, date: DateJour) {
    return this.executer(["presences"], (d) => d.supprimerPresence(auteurId, enfantId, date));
  }

  listerTransferts(f?: Omit<FiltrePeriode, "enfantId">) {
    return this.lire(["transferts"], (d) => d.listerTransferts(f));
  }
  enregistrerTransfert(auteurId: string, t: Omit<Transfert, "id"> & { id?: string }) {
    return this.executer(["transferts"], (d) => d.enregistrerTransfert(auteurId, t));
  }
  supprimerTransfert(auteurId: string, id: string) {
    return this.executer(["transferts"], (d) => d.supprimerTransfert(auteurId, id));
  }

  listerCreneaux(f?: FiltrePeriode) {
    return this.lire(["creneaux"], (d) => d.listerCreneaux(f));
  }
  enregistrerCreneau(auteurId: string, c: Omit<Creneau, "id"> & { id?: string }) {
    return this.executer(["creneaux"], (d) => d.enregistrerCreneau(auteurId, c));
  }
  supprimerCreneau(auteurId: string, id: string) {
    return this.executer(["creneaux"], (d) => d.supprimerCreneau(auteurId, id));
  }

  listerDemandes() {
    return this.lire(["demandes"], (d) => d.listerDemandes());
  }
  proposerEchange(auteurId: string, demande: NouvelleDemande) {
    return this.executer(["demandes"], (d) => d.proposerEchange(auteurId, demande));
  }
  repondreEchange(repondeurId: string, demandeId: string, reponse: "acceptee" | "refusee") {
    return this.executer(["demandes", "gardes", "presences"], (d) => d.repondreEchange(repondeurId, demandeId, reponse));
  }

  listerRegles() {
    return this.lire(["regles"], (d) => d.listerRegles());
  }
  enregistrerRegle(auteurId: string, regle: Regle) {
    return this.executer(["regles"], (d) => d.enregistrerRegle(auteurId, regle));
  }
  supprimerRegle(auteurId: string, id: string) {
    return this.executer(["regles"], (d) => d.supprimerRegle(auteurId, id));
  }

  lireJournal() {
    return this.lire(["journal"], (d) => d.lireJournal());
  }
  evenementsANotifier(destinataireId: string) {
    return this.lire(["evenements"], (d) => d.evenementsANotifier(destinataireId));
  }
  marquerNotifie(destinataireId: string, evenementId: string) {
    return this.executer(["evenements"], (d) => d.marquerNotifie(destinataireId, evenementId));
  }
}
