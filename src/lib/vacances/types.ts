/** Période de vacances scolaires. Dates au format AAAA-MM-JJ, heure de Paris, telles que publiées (aucun décalage appliqué). */
export type PeriodeVacances = {
  nom: string;
  debut: string;
  fin: string;
  zone: string;
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
