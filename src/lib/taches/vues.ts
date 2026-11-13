import { ErreurDomaine } from "../domaine/depot";
import type { DateJour, Famille } from "../domaine/types";
import { ajouterJours, jourIso } from "../regles/dates";
import type { DepotTaches } from "./depot";
import { developperOccurrences, occurrenceSansDate } from "./occurrences";
import type { Occurrence, OccurrenceVue, VueTaches } from "./types";

export interface OptionsVueTaches {
  /** Profondeur de recherche du retard pour les séries récurrentes, en jours (défaut 60). */
  joursRattrapage?: number;
}

const parDate = (a: Occurrence, b: Occurrence) =>
  (a.date ?? "").localeCompare(b.date ?? "") || a.titre.localeCompare(b.titre) || a.cle.localeCompare(b.cle);

/**
 * Lecture des tâches pour un adulte. Le demandeur (`adulteId`) décide de ce qui est montré :
 * - ses tâches à faire : aujourd'hui, cette semaine (jusqu'à dimanche), à rattraper (en retard), sans échéance ;
 * - les tâches de l'autre adulte : seulement celles qui ne sont pas en retard, marquées `deLAutre` ;
 * - le retard de l'autre n'apparaît ni dans une section ni dans un compte.
 * Les tâches faites ne sont pas listées.
 */
export async function tachesPourAdulte(
  depot: DepotTaches,
  famille: Famille,
  adulteId: string,
  aujourdhui: DateJour,
  options: OptionsVueTaches = {},
): Promise<VueTaches> {
  if (!famille.adultes.some((a) => a.id === adulteId)) throw new ErreurDomaine(`Adulte inconnu : ${adulteId}`);
  const retardMax = options.joursRattrapage ?? 60;
  const dimanche = ajouterJours(aujourdhui, 7 - jourIso(aujourdhui));
  const debut = ajouterJours(aujourdhui, -retardMax);

  const vue: VueTaches = {
    adulteId,
    aujourdhui: [],
    cetteSemaine: [],
    aRattraper: [],
    sansEcheance: [],
    compte: { aujourdhui: 0, cetteSemaine: 0, aRattraper: 0, sansEcheance: 0 },
  };
  const brut: Record<"aujourdhui" | "cetteSemaine" | "aRattraper" | "sansEcheance", Occurrence[]> = {
    aujourdhui: [],
    cetteSemaine: [],
    aRattraper: [],
    sansEcheance: [],
  };

  for (const tache of await depot.lister()) {
    const miennes = tache.assigneId === adulteId;
    const sans = occurrenceSansDate(tache);
    if (sans) {
      if (sans.statut === "a_faire") brut.sansEcheance.push(sans);
      continue;
    }
    // Pour l'autre adulte, le passé n'est même pas calculé ; une tâche ponctuelle en retard n'est jamais tronquée.
    for (const o of developperOccurrences(tache, !miennes ? aujourdhui : tache.recurrence ? debut : "0000-01-01", dimanche)) {
      if (o.statut !== "a_faire" || !o.date) continue;
      if (o.date < aujourdhui) brut.aRattraper.push(o);
      else if (o.date === aujourdhui) brut.aujourdhui.push(o);
      else brut.cetteSemaine.push(o);
    }
  }

  for (const section of Object.keys(brut) as (keyof typeof brut)[]) {
    vue[section] = brut[section]
      .filter((o) => section !== "aRattraper" || o.assigneId === adulteId) // défense en profondeur
      .sort(parDate)
      .map((o): OccurrenceVue => ({ ...o, deLAutre: o.assigneId !== adulteId }));
    vue.compte[section] = vue[section].length;
  }
  return vue;
}
