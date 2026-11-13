import { ajouterJours } from "../regles/dates";
import type { PeriodeVacances as PeriodeMoteur } from "../regles/types";
import type { PeriodeVacances } from "./types";

/**
 * Convertit les périodes publiées (`fin` = jour de reprise) en périodes du moteur (`fin` = dernier jour inclus,
 * donc la veille de la reprise). Une période qui serait vide après conversion est écartée.
 */
export function periodesPourMoteur(periodes: PeriodeVacances[]): PeriodeMoteur[] {
  return periodes
    .map(({ nom, debut, fin, zone }) => ({ nom, debut, fin: ajouterJours(fin, -1), zone }))
    .filter((p) => p.fin >= p.debut);
}
