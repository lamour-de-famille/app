import { periodesVacances } from "./normalisation";
import type { ClientVacances, CritereVacances, PeriodeVacances } from "./types";

export * from "./types";
export { periodesVacances, normaliser, jourDeParis } from "./normalisation";
export { ClientVacancesHttp } from "./client-http";
export { ClientVacancesDoublure } from "./doublure";
export { periodesPourMoteur } from "./conversion";
export { critereDepuisEnv } from "./configuration";

/** Récupère puis normalise les vacances. Propage ErreurVacances (à gérer par l'appelant). */
export async function importerVacances(client: ClientVacances, critere: CritereVacances): Promise<PeriodeVacances[]> {
  return periodesVacances(await client.recuperer(critere), critere);
}
