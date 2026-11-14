import type { SortieDictee } from "../ia/types";

export interface PropositionStockee {
  id: string;
  auteurId: string;
  /** Millisecondes depuis l'époque. */
  expireLe: number;
  sortie: SortieDictee;
  avertissements: string[];
}

/** Propositions en attente de validation. Côté serveur seulement : le client ne renvoie jamais le contenu. */
export interface StockagePropositions {
  ajouter(p: PropositionStockee): Promise<void>;
  /**
   * Rend la proposition ET la retire, de façon atomique (usage unique). Rend null si elle est inconnue,
   * expirée ou d'un autre auteur ; dans ce dernier cas elle n'est pas retirée (le vrai auteur peut encore valider).
   */
  prendre(id: string, auteurId: string, maintenant: Date): Promise<PropositionStockee | null>;
}

/** Au-delà, les plus anciennes sont écartées : la mémoire reste bornée. */
export const MAX_PROPOSITIONS_EN_ATTENTE = 50;

export class StockagePropositionsMemoire implements StockagePropositions {
  private readonly donnees = new Map<string, PropositionStockee>();

  async ajouter(p: PropositionStockee) {
    while (this.donnees.size >= MAX_PROPOSITIONS_EN_ATTENTE) this.donnees.delete(this.donnees.keys().next().value as string);
    this.donnees.set(p.id, structuredClone(p));
  }

  async prendre(id: string, auteurId: string, maintenant: Date) {
    const p = this.donnees.get(id);
    if (!p) return null;
    if (p.expireLe <= maintenant.getTime()) {
      this.donnees.delete(id);
      return null;
    }
    if (p.auteurId !== auteurId) return null;
    this.donnees.delete(id);
    return p;
  }
}
