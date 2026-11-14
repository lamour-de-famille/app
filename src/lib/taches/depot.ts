import type { DateJour } from "../domaine/types";
import type { AccuseTache, NouvelleTache, Tache } from "./types";

/**
 * Accès aux tâches (interface séparée de `DepotFamille`). Les deux adultes peuvent écrire ; la lecture
 * destinée à un écran passe par `tachesPourAdulte`, qui applique la confidentialité du retard.
 *
 * Accès brut, réservé à la couche serveur (jamais renvoyé à un client) : `lister`. Les écritures ne renvoient
 * qu'un `AccuseTache` (id, clé), jamais la tâche : sinon l'échéance, le statut ou les exceptions d'une tâche
 * de l'autre adulte fuiteraient. Un adulte non assigné ne peut ni modifier (`enregistrer` avec id) ni supprimer une tâche de l'autre ayant du passé (erreur « Tâche inconnue »), et toute modification d'assigné, d'échéance ou de récurrence par un non-assigné remet statut, faiteLe et exceptions à zéro. Règle d'écriture : un adulte non assigné ne peut ni cocher ni décocher une
 * occurrence antérieure à aujourd'hui (le retard de l'autre reste privé) ; l'horloge est `maintenant`.
 */
export interface DepotTaches {
  /** Jour courant (Europe/Paris) d'après l'horloge du dépôt, côté serveur ; jamais fourni par un client. */
  aujourdhui(): DateJour;
  lister(): Promise<Tache[]>;
  /**
   * Crée (sans id) ou modifie (avec id). Valide assigné, enfant, dates et récurrence. Seuls titre, assigneId,
   * echeance, recurrence (frequence, intervalle, fin) et enfantId sont pris en compte ; creeParId, statut,
   * faiteLe et exceptions ne sont jamais modifiables par l'appelant.
   */
  enregistrer(auteurId: string, tache: NouvelleTache): Promise<AccuseTache>;
  supprimer(auteurId: string, id: string): Promise<void>;
  /** Tâche ponctuelle : `date` omise. Tâche récurrente : `date` doit être une occurrence réelle ; seule elle est cochée. */
  cocher(auteurId: string, tacheId: string, date?: DateJour): Promise<AccuseTache>;
  decocher(auteurId: string, tacheId: string, date?: DateJour): Promise<AccuseTache>;
}
