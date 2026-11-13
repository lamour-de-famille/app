import { ErreurDomaine } from "../domaine/depot";
import { ajouterJours, depuisMs } from "../regles/dates";
import type { DateJour } from "../domaine/types";
import { cleOccurrence, type Occurrence, type Recurrence, type Tache } from "./types";

/** Date de la n-ième occurrence (n = 0 : l'ancre). */
export function dateOccurrence(ancre: DateJour, r: Recurrence, n: number): DateJour {
  if (r.frequence === "quotidienne") return ajouterJours(ancre, n * r.intervalle);
  if (r.frequence === "hebdomadaire") return ajouterJours(ancre, n * r.intervalle * 7);
  const [a, m, j] = ancre.split("-").map(Number) as [number, number, number];
  const total = m - 1 + n * r.intervalle;
  const annee = a + Math.floor(total / 12);
  const mois = total % 12;
  const dernier = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  return depuisMs(Date.UTC(annee, mois, Math.min(j, dernier)));
}

const RE_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Vrai si la valeur est une date calendaire réelle (pas 2026-02-31). */
export function dateReelle(d: unknown): d is DateJour {
  if (typeof d !== "string" || !RE_DATE.test(d)) return false;
  const [a, m, j] = d.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(a, m - 1, j));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === j;
}

/** Plus petit n (par défaut) à partir duquel parcourir : jamais après la première occurrence >= du. */
function indiceDepart(ancre: DateJour, r: Recurrence, du: DateJour): number {
  if (du <= ancre) return 0;
  const [a, m] = ancre.split("-").map(Number) as [number, number];
  const [ad, md] = du.split("-").map(Number) as [number, number];
  const jours = Math.floor((Date.parse(du) - Date.parse(ancre)) / 86_400_000);
  const brut =
    r.frequence === "quotidienne"
      ? jours / r.intervalle
      : r.frequence === "hebdomadaire"
        ? jours / (7 * r.intervalle)
        : ((ad - a) * 12 + (md - m)) / r.intervalle;
  return Math.max(0, Math.floor(brut) - 1);
}

/** Dates d'une récurrence dans [du, au] (bornes incluses). Refuse intervalle ou dates invalides. */
export function datesRecurrence(ancre: DateJour, r: Recurrence, du: DateJour, au: DateJour): DateJour[] {
  if (!Number.isInteger(r.intervalle) || r.intervalle < 1) throw new ErreurDomaine("Intervalle : entier >= 1");
  for (const d of [ancre, du, au]) if (!dateReelle(d)) throw new ErreurDomaine(`Date invalide : ${String(d)}`);
  if (r.fin !== undefined && !dateReelle(r.fin)) throw new ErreurDomaine(`Date invalide : ${String(r.fin)}`);
  const fin = r.fin !== undefined && r.fin < au ? r.fin : au;
  const dates: DateJour[] = [];
  for (let n = indiceDepart(ancre, r, du); ; n++) {
    const d = dateOccurrence(ancre, r, n);
    if (d > fin) break;
    if (d >= du) dates.push(d);
  }
  return dates;
}

const base = (t: Tache) => ({
  tacheId: t.id,
  titre: t.titre,
  assigneId: t.assigneId,
  ...(t.enfantId ? { enfantId: t.enfantId } : {}),
});

/**
 * Développe une tâche en occurrences sur [du, au]. Une tâche ponctuelle n'a qu'une occurrence (si son échéance
 * est dans la fenêtre). Cocher une occurrence ne touche que son exception. Sans échéance : voir `occurrenceSansDate`.
 */
export function developperOccurrences(tache: Tache, du: DateJour, au: DateJour): Occurrence[] {
  if (!tache.echeance) return [];
  if (!tache.recurrence) {
    if (tache.echeance < du || tache.echeance > au) return [];
    return [
      {
        ...base(tache),
        cle: cleOccurrence(tache.id, tache.echeance),
        date: tache.echeance,
        statut: tache.statut,
        ...(tache.faiteLe ? { faiteLe: tache.faiteLe } : {}),
        recurrente: false,
      },
    ];
  }
  return datesRecurrence(tache.echeance, tache.recurrence, du, au).map((date): Occurrence => {
    const ex = tache.exceptions?.find((e) => e.date === date);
    return {
      ...base(tache),
      cle: cleOccurrence(tache.id, date),
      date,
      statut: ex ? "faite" : "a_faire",
      ...(ex ? { faiteLe: ex.faiteLe } : {}),
      recurrente: true,
    };
  });
}

export function occurrenceSansDate(tache: Tache): Occurrence | undefined {
  if (tache.echeance) return undefined;
  return {
    ...base(tache),
    cle: cleOccurrence(tache.id),
    statut: tache.statut,
    ...(tache.faiteLe ? { faiteLe: tache.faiteLe } : {}),
    recurrente: false,
  };
}
