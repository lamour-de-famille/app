/**
 * Moteur de règles : fonctions pures. Toute valeur provient des règles (données) ;
 * rien n'est lu en dehors des arguments.
 */
import type { Creneau, DateJour } from "../domaine/types";
import { ajouterJours, bornesMois, jourIso, plage, sansAccent, semaineIso } from "./dates";
import type {
  PeriodeVacances,
  Parite,
  Regle,
  RegleDerivee,
  RegleVacances,
  RegleWeekEnd,
  Segment,
} from "./types";

const FIN_DE_JOUR = "23:59";
const DEBUT_DE_JOUR = "00:00";

const pariteDe = (n: number): Parite => (n % 2 === 0 ? "paire" : "impaire");
const instant = (i: { date: string; heure: string }) => `${i.date}T${i.heure}`;

function segmentsWeekEnd(r: RegleWeekEnd, du: DateJour, au: DateJour): Segment[] {
  const resultat: Segment[] = [];
  // Un week-end commencé avant le mois peut le recouvrir : on remonte d'une semaine.
  for (const d of plage(ajouterJours(du, -8), au)) {
    if (jourIso(d) !== r.debut.jour || pariteDe(semaineIso(d)) !== r.parite) continue;
    let fin = d;
    for (let k = 0; k <= 7; k++) {
      fin = ajouterJours(d, k);
      if (jourIso(fin) === r.fin.jour && (k > 0 || r.fin.heure > r.debut.heure)) break;
    }
    resultat.push({
      regleId: r.id,
      libelle: r.libelle,
      enfantIds: [...r.enfantIds],
      responsableId: r.responsableId,
      debut: { date: d, heure: r.debut.heure },
      fin: { date: fin, heure: r.fin.heure },
      nuits: plage(d, ajouterJours(fin, -1)),
      prise: true,
      remise: true,
      ...(r.lieuTransfertId ? { lieuTransfertId: r.lieuTransfertId } : {}),
    });
  }
  return resultat;
}

function segmentsVacances(r: RegleVacances, periodes: PeriodeVacances[]): Segment[] {
  const resultat: Segment[] = [];
  const motif = sansAccent(r.nomContient);
  for (const p of periodes) {
    if (r.zone !== undefined && p.zone !== r.zone) continue;
    if (!sansAccent(p.nom).includes(motif)) continue;
    const annee = Number((r.anneeReference === "debut" ? p.debut : p.fin).slice(0, 4));
    const responsables = r.attributions[pariteDe(annee)];
    const premier = r.departDecompte === "lendemain" ? ajouterJours(p.debut, 1) : p.debut;
    if (premier > p.fin) continue;
    const jours = plage(premier, p.fin);
    const n = jours.length;
    const bornes = Array.from({ length: r.parts + 1 }, (_, i) => Math.floor((i * n) / r.parts));
    const blocs = responsables
      .map((responsableId, i) => ({ responsableId, de: bornes[i]!, a: bornes[i + 1]! }))
      .filter((b) => b.de < b.a);
    blocs.forEach((b, i) => {
      const dernier = i === blocs.length - 1;
      resultat.push({
        regleId: r.id,
        libelle: r.libelle,
        enfantIds: [...r.enfantIds],
        responsableId: b.responsableId,
        debut: { date: jours[b.de]!, heure: r.heureChangement },
        fin: dernier
          ? { date: p.fin, heure: FIN_DE_JOUR }
          : { date: jours[b.a]!, heure: r.heureChangement },
        nuits: jours.slice(b.de, b.a),
        prise: i === 0 || blocs[i - 1]!.responsableId !== b.responsableId,
        remise: !dernier && blocs[i + 1]!.responsableId !== b.responsableId,
        ...(r.lieuTransfertId ? { lieuTransfertId: r.lieuTransfertId } : {}),
      });
    });
  }
  return resultat;
}

function segmentsDerivee(r: RegleDerivee, source: Segment[]): Segment[] {
  return source
    .filter((s) => s.responsableId === r.suitAdulteId)
    .map((s) => ({
      ...s,
      regleId: r.id,
      libelle: r.libelle,
      enfantIds: [...r.enfantIds],
      nuits: [...s.nuits],
      ...(r.lieuTransfertId ? { lieuTransfertId: r.lieuTransfertId } : {}),
    }));
}

/**
 * Segments du mois (ceux qui le recouvrent, éventuellement en partie), après
 * résolution des chevauchements par priorité. Déterministe, indépendant de l'ordre des règles.
 */
export function genererSegments(regles: Regle[], periodes: PeriodeVacances[], mois: string): Segment[] {
  const { du, au } = bornesMois(mois);
  const actives = regles.filter((r) => r.actif);
  const parId = new Map(actives.map((r) => [r.id, r]));
  const prioriteEffective = (r: Regle): number =>
    r.type === "derivee" ? (parId.get(r.sourceId)?.priorite ?? r.priorite) : r.priorite;
  const ordre = [...actives].sort(
    (a, b) =>
      prioriteEffective(b) - prioriteEffective(a) ||
      Number(a.type === "derivee") - Number(b.type === "derivee") ||
      a.id.localeCompare(b.id),
  );

  const resolus = new Map<string, Segment[]>();
  const occupe = new Map<string, Array<[string, string]>>();
  for (const r of ordre) {
    let brut: Segment[];
    if (r.type === "week_end") brut = segmentsWeekEnd(r, du, au);
    else if (r.type === "vacances") brut = segmentsVacances(r, periodes);
    else {
      const source = parId.get(r.sourceId);
      brut = source && source.type !== "derivee" ? segmentsDerivee(r, resolus.get(source.id) ?? []) : [];
    }
    const gardes: Segment[] = [];
    for (const s of brut) {
      const libres = s.enfantIds.filter(
        (e) => !(occupe.get(e) ?? []).some(([a, b]) => a < instant(s.fin) && instant(s.debut) < b),
      );
      if (libres.length > 0) gardes.push({ ...s, enfantIds: libres });
    }
    for (const s of gardes) {
      for (const e of s.enfantIds) occupe.set(e, [...(occupe.get(e) ?? []), [instant(s.debut), instant(s.fin)]]);
    }
    resolus.set(r.id, gardes);
  }

  return [...resolus.values()]
    .flat()
    .filter((s) => s.fin.date >= du && s.debut.date <= au)
    .sort((a, b) => instant(a.debut).localeCompare(instant(b.debut)) || a.regleId.localeCompare(b.regleId));
}

export const idCreneauRegle = (regleId: string, enfantId: string, date: DateJour, debut: string) =>
  `rg:${regleId}:${enfantId}:${date}:${debut.replace(":", "")}`;

/** Créneaux journaliers du mois, marqués `origine: regle`, triés. */
export function genererCreneaux(regles: Regle[], periodes: PeriodeVacances[], mois: string): Creneau[] {
  const { du, au } = bornesMois(mois);
  const creneaux: Creneau[] = [];
  for (const s of genererSegments(regles, periodes, mois)) {
    for (const date of plage(s.debut.date, s.fin.date)) {
      if (date < du || date > au) continue;
      const debut = date === s.debut.date ? s.debut.heure : DEBUT_DE_JOUR;
      const fin = date === s.fin.date ? s.fin.heure : FIN_DE_JOUR;
      if (date !== s.debut.date && fin === DEBUT_DE_JOUR) continue;
      for (const enfantId of s.enfantIds) {
        creneaux.push({
          id: idCreneauRegle(s.regleId, enfantId, date, debut),
          enfantId,
          date,
          debut,
          fin,
          libelle: s.libelle,
          origine: { type: "regle", regleId: s.regleId },
        });
      }
    }
  }
  return creneaux.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.debut.localeCompare(b.debut) ||
      a.enfantId.localeCompare(b.enfantId) ||
      a.id.localeCompare(b.id),
  );
}
