/**
 * Fine abstraction au-dessus de Firestore : des documents JSON rangés par collection (chemin complet,
 * ex. « familles/f1/gardes »). Tout passe par une transaction : toutes les lectures d'abord, puis les
 * écritures (contrainte de Firestore), validées ensemble ou pas du tout.
 */
export type Donnees = Record<string, unknown>;

export interface DocumentBanque {
  id: string;
  donnees: Donnees;
}

export interface TransactionBanque {
  lire(collection: string, id: string): Promise<Donnees | undefined>;
  /** Tous les documents de la collection, triés par id. */
  lister(collection: string): Promise<DocumentBanque[]>;
  ecrire(collection: string, id: string, donnees: Donnees): void;
  supprimer(collection: string, id: string): void;
}

export interface OptionsTransaction {
  /** Lecture seule : toute écriture est refusée (et Firestore ne pose aucun verrou d'écriture). */
  lectureSeule?: boolean;
}

export interface Banque {
  transaction<T>(travail: (tx: TransactionBanque) => Promise<T>, options?: OptionsTransaction): Promise<T>;
}

/** Firestore refuse les valeurs `undefined` : on les retire (comme le ferait une sérialisation JSON). */
export function nettoyer<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T;
}

/** Ordre des ids : unités de code, identique partout (jamais `localeCompare`). */
export const comparerIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export { idDocumentValide } from "../domaine/identifiant";
