import type { CritereVacances } from "./types";

/** Lit VACANCES_ACADEMIE, VACANCES_ZONE et VACANCES_ANNEE_SCOLAIRE ; valeurs vides = pas de filtre. */
export function critereDepuisEnv(env: Record<string, string | undefined> = process.env): CritereVacances {
  const lire = (k: string) => env[k]?.trim() || undefined;
  return { academie: lire("VACANCES_ACADEMIE"), zone: lire("VACANCES_ZONE"), anneeScolaire: lire("VACANCES_ANNEE_SCOLAIRE") };
}
