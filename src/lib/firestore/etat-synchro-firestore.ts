import type { EtatSynchro, StockageEtatSynchro } from "../agenda/types";
import { idDocumentValide, type Banque, type Donnees } from "./banque";

/** Persiste l'état de synchro Agenda sous `familles/{familleId}/etatsSynchro/{adulteId}`. */
export class StockageEtatFirestore implements StockageEtatSynchro {
  private readonly collection: string;

  constructor(
    private readonly banque: Banque,
    familleId: string,
  ) {
    this.collection = `familles/${familleId}/etatsSynchro`;
  }

  async lire(adulteId: string) {
    const d = await this.banque.transaction((tx) => tx.lire(this.collection, adulteId));
    return d as unknown as EtatSynchro | undefined;
  }

  async ecrire(etat: EtatSynchro) {
    if (!idDocumentValide(etat.adulteId)) throw new Error("Identifiant d'adulte invalide");
    await this.banque.transaction(async (tx) => tx.ecrire(this.collection, etat.adulteId, etat as unknown as Donnees));
  }
}
