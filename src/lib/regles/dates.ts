import type { DateJour } from "../domaine/types";
import type { JourIso } from "./types";

const JOUR_MS = 86_400_000;

export const versMs = (d: DateJour): number => {
  const [a, m, j] = d.split("-").map(Number) as [number, number, number];
  return Date.UTC(a, m - 1, j);
};
export const depuisMs = (ms: number): DateJour => new Date(ms).toISOString().slice(0, 10);
export const ajouterJours = (d: DateJour, n: number): DateJour => depuisMs(versMs(d) + n * JOUR_MS);

export const jourIso = (d: DateJour): JourIso => {
  const w = new Date(versMs(d)).getUTCDay();
  return (w === 0 ? 7 : w) as JourIso;
};

/** Numéro de semaine ISO 8601 (la semaine appartient à l'année de son jeudi). */
export const semaineIso = (d: DateJour): number => {
  const jeudi = versMs(d) + (4 - jourIso(d)) * JOUR_MS;
  const premier = Date.UTC(new Date(jeudi).getUTCFullYear(), 0, 1);
  return Math.floor((jeudi - premier) / JOUR_MS / 7) + 1;
};

/** Toutes les dates de `du` à `au`, bornes incluses. */
export const plage = (du: DateJour, au: DateJour): DateJour[] => {
  const r: DateJour[] = [];
  for (let d = du; d <= au; d = ajouterJours(d, 1)) r.push(d);
  return r;
};

/** Premier et dernier jour d'un mois « AAAA-MM ». */
export const bornesMois = (mois: string): { du: DateJour; au: DateJour } => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) throw new Error(`Mois invalide : ${mois}`);
  const du = `${mois}-01`;
  const [a, m] = mois.split("-").map(Number) as [number, number];
  return { du, au: depuisMs(Date.UTC(a, m, 0)) };
};

export const sansAccent = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
