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

export interface Banque {
  transaction<T>(travail: (tx: TransactionBanque) => Promise<T>): Promise<T>;
}

/** Firestore refuse les valeurs `undefined` : on les retire (comme le ferait une sérialisation JSON). */
export function nettoyer<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T;
}

export const comparerIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Un id de document ne peut ni contenir « / », ni valoir « . » ou « .. », ni être de la forme « __x__ ». */
export function idDocumentValide(id: string): boolean {
  return id.length > 0 && id.length <= 1500 && !id.includes("/") && id !== "." && id !== ".." && !/^__.*__$/.test(id);
}
