import type { PeriodeVacances as PeriodeMoteur } from "../regles/types";

/**
 * Période de vacances scolaires telle que publiée : AAAA-MM-JJ, jour civil de Paris, aucun décalage appliqué.
 * Attention : `fin` est la date publiée, soit le jour de reprise des cours. Le moteur de règles attend le
 * dernier jour inclus : passer par `periodesPourMoteur` (conversion.ts) avant de lui donner ces périodes.
 * Les champs communs sont ceux de `PeriodeVacances` du moteur (`regles/types.ts`), dont ce type dérive.
 */
export type PeriodeVacances = PeriodeMoteur & {
  anneeScolaire: string;
};

/** Enregistrement brut de l'API Explore v2.1 (champs utiles seulement, tout est optionnel). */
export type EnregistrementBrut = {
  description?: unknown;
  population?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  location?: unknown;
  zones?: unknown;
  annee_scolaire?: unknown;
};

export type CritereVacances = {
  /** Ex. « Zone A ». */
  zone?: string;
  /** Ex. « Lyon ». */
  academie?: string;
  /** Ex. « 2025-2026 ». */
  anneeScolaire?: string;
};

export interface ClientVacances {
  /** Lève ErreurVacances en cas d'échec réseau ou de réponse inexploitable. */
  recuperer(critere: CritereVacances): Promise<EnregistrementBrut[]>;
}

export class ErreurVacances extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ErreurVacances";
  }
}
