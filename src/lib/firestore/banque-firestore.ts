import type { Firestore } from "@google-cloud/firestore";
import { comparerIds, nettoyer, type Banque, type Donnees, type OptionsTransaction, type TransactionBanque } from "./banque";

/** Adaptateur Firestore (SDK `@google-cloud/firestore`) de la banque. */
export class BanqueFirestore implements Banque {
  constructor(private readonly db: Firestore) {}

  transaction<T>(travail: (tx: TransactionBanque) => Promise<T>, options: OptionsTransaction = {}): Promise<T> {
    return this.db.runTransaction(async (t) => {
      const tx: TransactionBanque = {
        lire: async (collection, id) => {
          const s = await t.get(this.db.collection(collection).doc(id));
          return s.exists ? (s.data() as Donnees) : undefined;
        },
        lister: async (collection) => {
          const s = await t.get(this.db.collection(collection));
          return s.docs.map((d) => ({ id: d.id, donnees: d.data() as Donnees })).sort((a, b) => comparerIds(a.id, b.id));
        },
        ecrire: (collection, id, donnees) => {
          t.set(this.db.collection(collection).doc(id), nettoyer(donnees));
        },
        supprimer: (collection, id) => {
          t.delete(this.db.collection(collection).doc(id));
        },
      };
      return travail(tx);
    }, options.lectureSeule ? { readOnly: true } : undefined);
  }
}

/**
 * Ouvre Firestore. Sans `FIRESTORE_EMULATOR_HOST`, les identifiants viennent de l'environnement
 * d'exécution (identité de la plateforme ou `GOOGLE_APPLICATION_CREDENTIALS`) : rien n'est lu ici.
 */
export async function ouvrirBanqueFirestore(projectId = process.env.FIRESTORE_PROJECT_ID): Promise<BanqueFirestore> {
  const { Firestore } = await import("@google-cloud/firestore");
  return new BanqueFirestore(new Firestore(projectId ? { projectId } : {}));
}
