import { comparerIds, nettoyer, type Banque, type Donnees, type OptionsTransaction, type TransactionBanque } from "./banque";

/** Banque en mémoire : double de test de Firestore (transactions sérialisées, écritures tout ou rien). */
export class BanqueMemoire implements Banque {
  private readonly collections = new Map<string, Map<string, Donnees>>();
  private file: Promise<unknown> = Promise.resolve();

  transaction<T>(travail: (tx: TransactionBanque) => Promise<T>, options: OptionsTransaction = {}): Promise<T> {
    const suite = this.file.then(() => this.executer(travail, options.lectureSeule === true));
    this.file = suite.catch(() => undefined);
    return suite;
  }

  /** Nombre total de documents (pour les tests). */
  compter(): number {
    return [...this.collections.values()].reduce((n, c) => n + c.size, 0);
  }

  private async executer<T>(travail: (tx: TransactionBanque) => Promise<T>, lectureSeule: boolean): Promise<T> {
    const ecritures: Array<() => void> = [];
    const collection = (nom: string) => this.collections.get(nom) ?? new Map<string, Donnees>();
    const tx: TransactionBanque = {
      lire: async (nom, id) => {
        if (ecritures.length > 0) throw new Error("Lecture après écriture dans une transaction");
        const d = collection(nom).get(id);
        return d && nettoyer(d);
      },
      lister: async (nom) => {
        if (ecritures.length > 0) throw new Error("Lecture après écriture dans une transaction");
        return [...collection(nom)]
          .sort(([a], [b]) => comparerIds(a, b))
          .map(([id, donnees]) => ({ id, donnees: nettoyer(donnees) }));
      },
      ecrire: (nom, id, donnees) => {
        if (lectureSeule) throw new Error("Écriture dans une transaction en lecture seule");
        const copie = nettoyer(donnees);
        ecritures.push(() => this.cible(nom).set(id, copie));
      },
      supprimer: (nom, id) => {
        if (lectureSeule) throw new Error("Suppression dans une transaction en lecture seule");
        ecritures.push(() => this.cible(nom).delete(id));
      },
    };
    const resultat = await travail(tx);
    for (const appliquer of ecritures) appliquer();
    return resultat;
  }

  private cible(nom: string) {
    let c = this.collections.get(nom);
    if (!c) this.collections.set(nom, (c = new Map()));
    return c;
  }
}
