import { ErreurDomaine } from "../domaine/depot";
import type { Compteur, StockageUsageIA } from "../ia/plafond";
import { idDocumentValide, type Banque, type Donnees } from "./banque";

const entier = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const versCompteur = (d: Donnees | undefined): Compteur => ({
  requetes: entier(d?.requetes),
  jetonsEntree: entier(d?.jetonsEntree),
  jetonsSortie: entier(d?.jetonsSortie),
});

/**
 * Compteurs d'usage de l'IA sous `familles/{familleId}/usageIA/{cle}` (ex. « jour:2026-11-14 »).
 * `ajouter` lit et écrit dans UNE transaction : deux instances qui incrémentent en même temps ne perdent
 * aucun ajout, donc le plafond tient entre instances.
 */
export class StockageUsageIAFirestore implements StockageUsageIA {
  private readonly collection: string;

  constructor(
    private readonly banque: Banque,
    familleId: string,
  ) {
    if (!idDocumentValide(familleId)) throw new ErreurDomaine(`Identifiant de famille invalide : ${familleId}`);
    this.collection = `familles/${familleId}/usageIA`;
  }

  private verifier(cle: string) {
    if (!idDocumentValide(cle)) throw new Error("Clé de compteur invalide");
  }

  async lire(cle: string): Promise<Compteur> {
    this.verifier(cle);
    return versCompteur(await this.banque.transaction((tx) => tx.lire(this.collection, cle), { lectureSeule: true }));
  }

  async ajouter(cle: string, delta: Compteur): Promise<Compteur> {
    this.verifier(cle);
    return this.banque.transaction(async (tx) => {
      const c = versCompteur(await tx.lire(this.collection, cle));
      const total: Compteur = {
        requetes: c.requetes + delta.requetes,
        jetonsEntree: c.jetonsEntree + delta.jetonsEntree,
        jetonsSortie: c.jetonsSortie + delta.jetonsSortie,
      };
      tx.ecrire(this.collection, cle, { ...total });
      return total;
    });
  }
}
