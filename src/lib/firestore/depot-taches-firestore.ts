import { randomUUID } from "node:crypto";
import { ErreurDomaine } from "../domaine/depot";
import type { DateJour, Famille } from "../domaine/types";
import type { DepotTaches } from "../taches/depot";
import { DepotTachesMemoire, jourParis } from "../taches/depot-memoire";
import type { AccuseTache, NouvelleTache, Tache } from "../taches/types";
import { idDocumentValide, nettoyer, type Banque, type Donnees } from "./banque";

export interface OptionsDepotTachesFirestore {
  /** Horloge injectable (tests). */
  maintenant?: () => Date;
  /** Générateur d'ids injectable (tests). Par défaut : UUID, non devinable. */
  genererId?: () => string;
}

/**
 * Tâches en Firestore, sous `familles/{familleId}/taches/{id}`. Même modèle que `DepotFirestore` : chaque
 * opération charge la famille et les tâches dans une transaction, exécute la logique de `DepotTachesMemoire`
 * (donc mêmes validations et mêmes règles de confidentialité du retard), puis n'écrit que les différences.
 *
 * Les ids sont des UUID : un id n'est plus devinable, ce qui ferme l'oracle des ids séquentiels (`tache-1`,
 * `tache-2`...) qui permettait de sonder l'existence des tâches de l'autre adulte.
 */
export class DepotTachesFirestore implements DepotTaches {
  private readonly maintenant: () => Date;
  private readonly genererId: () => string;
  private readonly collection: string;

  constructor(
    private readonly banque: Banque,
    private readonly familleId: string,
    options: OptionsDepotTachesFirestore = {},
  ) {
    if (!idDocumentValide(familleId)) throw new ErreurDomaine(`Identifiant de famille invalide : ${familleId}`);
    this.maintenant = options.maintenant ?? (() => new Date());
    this.genererId = options.genererId ?? randomUUID;
    this.collection = `familles/${familleId}/taches`;
  }

  aujourdhui(): DateJour {
    return jourParis(this.maintenant());
  }

  private executer<T>(travail: (d: DepotTachesMemoire) => Promise<T>, lectureSeule = false): Promise<T> {
    return this.banque.transaction(
      async (tx) => {
        const doc = await tx.lire("familles", this.familleId);
        if (!doc) throw new ErreurDomaine(`Famille introuvable : ${this.familleId}`);
        const docs = await tx.lister(this.collection);
        const avant = Object.fromEntries(docs.map((d) => [d.id, d.donnees]));
        const depot = new DepotTachesMemoire(doc as unknown as Famille, { maintenant: this.maintenant, genererId: this.genererId });
        depot.restaurerEtat(docs.map((d) => d.donnees as unknown as Tache));
        const resultat = await travail(depot);
        if (lectureSeule) return resultat;
        const apres = nettoyer(depot.exporterEtat()) as unknown as Record<string, Donnees>;
        for (const [id, valeur] of Object.entries(apres)) {
          if (JSON.stringify(avant[id]) === JSON.stringify(valeur)) continue;
          if (!idDocumentValide(id)) throw new ErreurDomaine(`Identifiant invalide : ${id}`);
          tx.ecrire(this.collection, id, valeur);
        }
        for (const id of Object.keys(avant)) if (!(id in apres)) tx.supprimer(this.collection, id);
        return resultat;
      },
      { lectureSeule },
    );
  }

  lister(): Promise<Tache[]> {
    return this.executer((d) => d.lister(), true);
  }
  enregistrer(auteurId: string, tache: NouvelleTache): Promise<AccuseTache> {
    return this.executer((d) => d.enregistrer(auteurId, tache));
  }
  supprimer(auteurId: string, id: string): Promise<void> {
    return this.executer((d) => d.supprimer(auteurId, id));
  }
  cocher(auteurId: string, tacheId: string, date?: DateJour): Promise<AccuseTache> {
    return this.executer((d) => d.cocher(auteurId, tacheId, date));
  }
  decocher(auteurId: string, tacheId: string, date?: DateJour): Promise<AccuseTache> {
    return this.executer((d) => d.decocher(auteurId, tacheId, date));
  }
}
