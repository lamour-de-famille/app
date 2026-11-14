import type { DateJour } from "../domaine/types";

export type FrequenceRecurrence = "quotidienne" | "hebdomadaire" | "mensuelle";

/**
 * Récurrence en données pures. L'ancre est l'échéance de la tâche.
 * Mensuelle : même quantième que l'ancre, ramené au dernier jour du mois s'il n'existe pas (31 -> 28/29/30).
 */
export interface Recurrence {
  frequence: FrequenceRecurrence;
  /** Entier >= 1 : tous les N jours / semaines / mois. */
  intervalle: number;
  /** Dernière date possible (incluse), optionnelle. */
  fin?: DateJour;
}

export type StatutTache = "a_faire" | "faite";

/** Occurrence d'une série cochée à part ; le reste de la série n'est pas touché. */
export interface ExceptionOccurrence {
  date: DateJour;
  /** Horodatage ISO 8601. */
  faiteLe: string;
}

export interface Tache {
  id: string;
  titre: string;
  /** Adulte de la famille responsable de la tâche. */
  assigneId: string;
  /** Obligatoire si `recurrence` est définie (ancre de la série). */
  echeance?: DateJour;
  recurrence?: Recurrence;
  enfantId?: string;
  /** Tâche ponctuelle : son statut. Tâche récurrente : reste « a_faire », voir `exceptions`. */
  statut: StatutTache;
  creeParId: string;
  /** Horodatage ISO 8601 (tâche ponctuelle cochée). */
  faiteLe?: string;
  /** Occurrences cochées d'une tâche récurrente. */
  exceptions?: ExceptionOccurrence[];
}

/** Saisie d'une tâche : sans id = création, avec id = modification des champs saisis. */
export type NouvelleTache = Omit<Tache, "id" | "statut" | "faiteLe" | "exceptions" | "creeParId"> & { id?: string };

/**
 * Retour minimal des écritures : l'appelant n'obtient jamais la tâche brute (échéance, statut, exceptions),
 * ce qui révélerait le retard de l'autre adulte. `cle` n'est présente que pour une occurrence cochée/décochée.
 */
export interface AccuseTache {
  id: string;
  cle?: string;
}

/**
 * Occurrence concrète d'une tâche. `cle` est stable (`<tacheId>@<date>` ou `<tacheId>@sans-date`) :
 * c'est la clé à utiliser pour la synchro Google Tasks.
 */
export interface Occurrence {
  cle: string;
  tacheId: string;
  titre: string;
  assigneId: string;
  enfantId?: string;
  /** Absente pour une tâche sans échéance. */
  date?: DateJour;
  statut: StatutTache;
  faiteLe?: string;
  recurrente: boolean;
}

export const cleOccurrence = (tacheId: string, date?: DateJour): string => `${tacheId}@${date ?? "sans-date"}`;

/** Occurrence telle que présentée à un adulte donné. */
export type OccurrenceVue = Occurrence & {
  /** Vrai si la tâche est assignée à l'autre adulte (visible, jamais en retard). */
  deLAutre: boolean;
};

export interface VueTaches {
  adulteId: string;
  aujourdhui: OccurrenceVue[];
  /** Après aujourd'hui, jusqu'au dimanche de la semaine ISO en cours. */
  cetteSemaine: OccurrenceVue[];
  /** Retard de l'adulte demandeur uniquement ; jamais le retard de l'autre. */
  aRattraper: OccurrenceVue[];
  /** Tâches à faire sans échéance. */
  sansEcheance: OccurrenceVue[];
  /** Comptes calculés à partir des sections ci-dessus (donc sans fuite). */
  compte: { aujourdhui: number; cetteSemaine: number; aRattraper: number; sansEcheance: number };
}
