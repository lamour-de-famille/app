import type { DateJour } from "../domaine/types";
import type { NouvelleTache, Tache } from "./types";

/**
 * Accès aux tâches (interface séparée de `DepotFamille`). Les deux adultes peuvent écrire ; la lecture
 * destinée à un écran passe par `tachesPourAdulte`, qui applique la confidentialité du retard.
 * `lister` est un accès brut réservé à la couche serveur : ne jamais l'exposer tel quel à un client.
 */
export interface DepotTaches {
  lister(): Promise<Tache[]>;
  /** Crée (sans id) ou modifie (avec id). Valide assigné, enfant, dates et récurrence. */
  enregistrer(auteurId: string, tache: NouvelleTache): Promise<Tache>;
  supprimer(auteurId: string, id: string): Promise<void>;
  /** Tâche ponctuelle : `date` omise. Tâche récurrente : `date` doit être une occurrence réelle ; seule elle est cochée. */
  cocher(auteurId: string, tacheId: string, date?: DateJour): Promise<Tache>;
  decocher(auteurId: string, tacheId: string, date?: DateJour): Promise<Tache>;
}
