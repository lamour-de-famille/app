import { ErreurDomaine } from "../domaine/depot";
import { MAX_PROPOSITIONS_EN_ATTENTE, type PropositionStockee, type StockagePropositions } from "../dictee/stockage-propositions";
import { idDocumentValide, nettoyer, type Banque } from "./banque";

/**
 * Propositions de dictée en attente, sous `familles/{familleId}/propositionsDictee/{id}`.
 * `prendre` lit puis supprime dans UNE transaction : deux validations simultanées (même instance ou non)
 * ne peuvent pas toutes deux obtenir la proposition (usage unique). `ajouter` purge les propositions expirées
 * puis écarte les plus anciennes au-delà de la borne, comme la version mémoire.
 */
export class StockagePropositionsFirestore implements StockagePropositions {
  private readonly collection: string;

  constructor(
    private readonly banque: Banque,
    familleId: string,
    private readonly maintenant: () => Date = () => new Date(),
  ) {
    if (!idDocumentValide(familleId)) throw new ErreurDomaine(`Identifiant de famille invalide : ${familleId}`);
    this.collection = `familles/${familleId}/propositionsDictee`;
  }

  async ajouter(p: PropositionStockee): Promise<void> {
    if (!idDocumentValide(p.id)) throw new Error("Identifiant de proposition invalide");
    await this.banque.transaction(async (tx) => {
      const existantes = (await tx.lister(this.collection))
        .filter((d) => d.id !== p.id)
        .map((d) => ({ id: d.id, expireLe: (d.donnees as unknown as PropositionStockee).expireLe }));
      const maintenant = this.maintenant().getTime();
      for (const e of existantes) if (!(e.expireLe > maintenant)) tx.supprimer(this.collection, e.id);
      // Au-delà de la borne, les plus proches de l'expiration (donc les plus anciennes) partent d'abord.
      const vivantes = existantes.filter((e) => e.expireLe > maintenant).sort((a, b) => a.expireLe - b.expireLe);
      const aEcarter = vivantes.length - (MAX_PROPOSITIONS_EN_ATTENTE - 1);
      for (const e of vivantes.slice(0, Math.max(0, aEcarter))) tx.supprimer(this.collection, e.id);
      tx.ecrire(this.collection, p.id, nettoyer(p) as unknown as Record<string, unknown>);
    });
  }

  async prendre(id: string, auteurId: string, maintenant: Date): Promise<PropositionStockee | null> {
    if (!idDocumentValide(id)) return null;
    return this.banque.transaction(async (tx) => {
      const d = await tx.lire(this.collection, id);
      if (!d) return null;
      const p = d as unknown as PropositionStockee;
      if (p.expireLe <= maintenant.getTime()) {
        tx.supprimer(this.collection, id);
        return null;
      }
      if (p.auteurId !== auteurId) return null;
      tx.supprimer(this.collection, id);
      return p;
    });
  }
}
