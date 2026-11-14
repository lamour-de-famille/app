/** Conversions pures entre la sortie de dictée et les écritures du domaine. */
import type { Creneau } from "../domaine/types";
import type { NoteDictee, RendezVousDictee, TacheDictee } from "../ia/types";
import type { NouvelleTache, Recurrence } from "../taches/types";

export const FIN_DE_JOURNEE = "23:59";

function recurrenceTache(t: TacheDictee): Recurrence | undefined {
  // Une série sans échéance n'a pas d'ancre : ignorée. Annuelle n'existe pas côté tâches : 12 mois.
  if (!t.echeance || !t.recurrence) return undefined;
  if (t.recurrence === "annuelle") return { frequence: "mensuelle", intervalle: 12 };
  return { frequence: t.recurrence === "quotidienne" ? "quotidienne" : t.recurrence === "hebdomadaire" ? "hebdomadaire" : "mensuelle", intervalle: 1 };
}

/** Sans responsable dicté, la tâche revient à l'auteur. */
export function versNouvelleTache(t: TacheDictee, auteurId: string): NouvelleTache {
  const recurrence = recurrenceTache(t);
  return {
    titre: t.titre,
    assigneId: t.assigneId ?? auteurId,
    ...(t.echeance && { echeance: t.echeance }),
    ...(t.enfantId && { enfantId: t.enfantId }),
    ...(recurrence && { recurrence }),
  };
}

/** Début et fin du créneau (HH:MM) ; fin absente : une heure plus tard ; fin hors du jour : 23:59. */
export function horaires(r: RendezVousDictee): { date: string; debut: string; fin: string; finAdaptee: boolean } {
  const date = r.debut.slice(0, 10);
  const debut = r.debut.slice(11, 16);
  if (r.fin && r.fin.slice(0, 10) === date) return { date, debut, fin: r.fin.slice(11, 16), finAdaptee: false };
  if (r.fin) return { date, debut, fin: FIN_DE_JOURNEE, finAdaptee: true };
  const h = Number(debut.slice(0, 2)) + 1;
  return { date, debut, fin: h > 23 ? FIN_DE_JOURNEE : `${String(h).padStart(2, "0")}${debut.slice(2)}`, finAdaptee: true };
}

export const libelleRendezVous = (r: RendezVousDictee): string => (r.lieu ? `${r.titre} (${r.lieu})` : r.titre);

/** Un créneau par enfant ; liste vide si le rendez-vous ne désigne aucun enfant. */
export function versCreneaux(r: RendezVousDictee): Omit<Creneau, "id">[] {
  const h = horaires(r);
  return [...new Set(r.enfantIds ?? [])].map((enfantId) => ({ enfantId, date: h.date, debut: h.debut, fin: h.fin, libelle: libelleRendezVous(r) }));
}

/** Rendez-vous sans enfant : gardé comme note datée. */
export function versNote(r: RendezVousDictee): NoteDictee {
  const h = horaires(r);
  return { texte: `Rendez-vous : ${libelleRendezVous(r)}, le ${h.date} à ${h.debut}.` };
}

export function avertissementsDe(s: { taches: TacheDictee[]; rendezVous: RendezVousDictee[]; notes: NoteDictee[] }): string[] {
  const a: string[] = [];
  if (s.taches.length + s.rendezVous.length + s.notes.length === 0) a.push("Rien à ranger dans cette dictée.");
  for (const t of s.taches) {
    if (!t.assigneId) a.push(`Tâche « ${t.titre} » : sans responsable, elle vous sera confiée.`);
    if (t.recurrence === "annuelle") a.push(`Tâche « ${t.titre} » : récurrence annuelle enregistrée tous les 12 mois.`);
    if (t.recurrence && !t.echeance) a.push(`Tâche « ${t.titre} » : récurrence ignorée, faute d'échéance.`);
  }
  for (const r of s.rendezVous) {
    if (!r.enfantIds?.length) a.push(`Rendez-vous « ${r.titre} » : aucun enfant désigné, il sera gardé comme note.`);
    else if (horaires(r).finAdaptee) a.push(`Rendez-vous « ${r.titre} » : fin ${r.fin ? "ramenée à la fin de la journée" : "fixée une heure après le début"}.`);
  }
  return a;
}
