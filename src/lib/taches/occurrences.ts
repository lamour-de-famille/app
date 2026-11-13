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

/** Dates d'une récurrence dans [du, au] (bornes incluses). */
export function datesRecurrence(ancre: DateJour, r: Recurrence, du: DateJour, au: DateJour): DateJour[] {
  const fin = r.fin !== undefined && r.fin < au ? r.fin : au;
  const dates: DateJour[] = [];
  for (let n = 0; ; n++) {
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
