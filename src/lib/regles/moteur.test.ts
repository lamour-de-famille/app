import { describe, expect, it } from "vitest";
import { genererCreneaux, genererSegments } from "./moteur";
import { jourIso, semaineIso } from "./dates";
import type { PeriodeVacances, Regle, RegleDerivee, RegleVacances, RegleWeekEnd } from "./types";

// Toutes les règles ci-dessous sont fictives et volontairement non réalistes.
const weekEndPair: RegleWeekEnd = {
  id: "we-pair",
  type: "week_end",
  libelle: "Semaines paires, samedi-dimanche",
  actif: true,
  priorite: 0,
  parite: "paire",
  responsableId: "sam",
  enfantIds: ["leo", "mila"],
  debut: { jour: 6, heure: "10:00" },
  fin: { jour: 7, heure: "17:00" },
};

const weekEndImpair: RegleWeekEnd = {
  ...weekEndPair,
  id: "we-impair",
  libelle: "Semaines impaires, vendredi-lundi",
  parite: "impaire",
  responsableId: "alex",
  debut: { jour: 5, heure: "18:00" },
  fin: { jour: 1, heure: "08:30" },
};

const moities: RegleVacances = {
  id: "vac-moities",
  type: "vacances",
  libelle: "Congés en moitiés",
  actif: true,
  priorite: 5,
  nomContient: "printemps",
  zone: "Z-test",
  parts: 2,
  attributions: { paire: ["alex", "sam"], impaire: ["sam", "alex"] },
  enfantIds: ["leo"],
  departDecompte: "jour_officiel",
  heureChangement: "18:00",
  anneeReference: "debut",
};

const quarts: RegleVacances = {
  ...moities,
  id: "vac-quarts",
  libelle: "Grand congé en quarts",
  nomContient: "grand conge",
  zone: undefined,
  parts: 4,
  attributions: { paire: ["alex", "sam", "alex", "sam"], impaire: ["sam", "alex", "sam", "alex"] },
  enfantIds: ["leo", "mila", "nina"],
};

const printemps2026: PeriodeVacances = {
  nom: "Vacances de Printemps (fictives)",
  debut: "2026-04-04",
  fin: "2026-04-18",
  zone: "Z-test",
};
const grandConge2026: PeriodeVacances = { nom: "Grand congé", debut: "2026-07-04", fin: "2026-08-31", zone: "Z-autre" };

describe("dates ISO", () => {
  it("calcule jour et semaine ISO, y compris aux changements d'année", () => {
    expect(jourIso("2026-03-07")).toBe(6);
    expect(jourIso("2026-03-08")).toBe(7);
    expect(semaineIso("2026-03-07")).toBe(10);
    expect(semaineIso("2026-12-31")).toBe(53);
    expect(semaineIso("2027-01-01")).toBe(53);
    expect(semaineIso("2024-12-30")).toBe(1);
    expect(semaineIso("2026-01-01")).toBe(1);
  });
});

describe("week-ends selon la parité de semaine ISO", () => {
  it("semaines paires, samedi 10:00 au dimanche 17:00", () => {
    const seg = genererSegments([weekEndPair], [], "2026-03");
    expect(seg.map((s) => [s.debut, s.fin])).toEqual([
      [{ date: "2026-03-07", heure: "10:00" }, { date: "2026-03-08", heure: "17:00" }],
      [{ date: "2026-03-21", heure: "10:00" }, { date: "2026-03-22", heure: "17:00" }],
    ]);
    expect(seg[0]!.nuits).toEqual(["2026-03-07"]);
    expect(seg[0]).toMatchObject({ responsableId: "sam", prise: true, remise: true });
  });

  it("produit des créneaux journaliers marqués par la règle, pour chaque enfant", () => {
    const c = genererCreneaux([weekEndPair], [], "2026-03");
    expect(c).toHaveLength(2 * 2 * 2);
    const samedi = c.find((x) => x.enfantId === "leo" && x.date === "2026-03-07")!;
    expect(samedi).toMatchObject({ debut: "10:00", fin: "23:59", origine: { type: "regle", regleId: "we-pair" } });
    const dimanche = c.find((x) => x.enfantId === "leo" && x.date === "2026-03-08")!;
    expect(dimanche).toMatchObject({ debut: "00:00", fin: "17:00" });
  });

  it("semaines impaires, vendredi 18:00 au lundi 08:30 (enjambe le mois précédent)", () => {
    const seg = genererSegments([weekEndImpair], [], "2026-03");
    expect(seg.map((s) => `${s.debut.date}>${s.fin.date}`)).toEqual([
      "2026-02-27>2026-03-02",
      "2026-03-13>2026-03-16",
      "2026-03-27>2026-03-30",
    ]);
    const dates = new Set(genererCreneaux([weekEndImpair], [], "2026-03").map((x) => x.date));
    expect(dates.has("2026-02-28")).toBe(false);
    expect(dates.has("2026-03-01")).toBe(true);
    expect(dates.has("2026-03-02")).toBe(true);
  });

  it("une fin au même jour mais plus tôt que le début tombe la semaine suivante", () => {
    const r: RegleWeekEnd = { ...weekEndPair, debut: { jour: 3, heure: "14:00" }, fin: { jour: 3, heure: "09:00" } };
    const seg = genererSegments([r], [], "2026-03");
    expect(seg[0]!.debut.date).toBe("2026-03-04");
    expect(seg[0]!.fin.date).toBe("2026-03-11");
  });

  it("ignore une règle inactive", () => {
    expect(genererCreneaux([{ ...weekEndPair, actif: false }], [], "2026-03")).toEqual([]);
  });
});

describe("vacances en moitiés selon la parité de l'année", () => {
  it("année paire : le premier bloc va au premier adulte de la liste", () => {
    const seg = genererSegments([moities], [printemps2026], "2026-04");
    expect(seg).toHaveLength(2);
    expect(seg[0]).toMatchObject({
      responsableId: "alex",
      debut: { date: "2026-04-04", heure: "18:00" },
      fin: { date: "2026-04-11", heure: "18:00" },
      prise: true,
      remise: true,
    });
    expect(seg[1]).toMatchObject({ responsableId: "sam", debut: { date: "2026-04-11" }, fin: { date: "2026-04-18", heure: "23:59" } });
    expect(seg[1]!.remise).toBe(false);
    expect(seg[1]!.nuits).toHaveLength(8);
  });

  it("année impaire : attribution inversée", () => {
    const p: PeriodeVacances = { ...printemps2026, debut: "2027-04-03", fin: "2027-04-17" };
    const seg = genererSegments([moities], [p], "2027-04");
    expect(seg.map((s) => s.responsableId)).toEqual(["sam", "alex"]);
  });

  it("le point de départ du décompte décale la coupure", () => {
    const lendemain = genererSegments([{ ...moities, departDecompte: "lendemain" }], [printemps2026], "2026-04");
    expect(lendemain[0]!.debut.date).toBe("2026-04-05");
    expect(lendemain[0]!.fin.date).toBe("2026-04-12");
    expect(lendemain[1]!.debut.date).toBe("2026-04-12");
  });

  it("l'année de référence peut être celle de la fin", () => {
    const p: PeriodeVacances = { nom: "Printemps charnière", debut: "2026-12-26", fin: "2027-01-09", zone: "Z-test" };
    const parDebut = genererSegments([moities], [p], "2026-12");
    const parFin = genererSegments([{ ...moities, anneeReference: "fin" }], [p], "2026-12");
    expect(parDebut[0]!.responsableId).toBe("alex");
    expect(parFin[0]!.responsableId).toBe("sam");
  });

  it("filtre par nom (sans accent ni casse) et par zone", () => {
    const autreZone = { ...printemps2026, zone: "Z-autre" };
    const autreNom = { ...printemps2026, nom: "Congé des moissons" };
    expect(genererSegments([moities], [autreZone, autreNom], "2026-04")).toEqual([]);
    const accent: PeriodeVacances = { ...grandConge2026, nom: "GRAND CONGÉ" };
    expect(genererSegments([quarts], [accent], "2026-07").length).toBeGreaterThan(0);
  });
});

describe("vacances d'été en quarts", () => {
  it("découpe 59 jours en 4 blocs contigus sans trou", () => {
    const seg = genererSegments([quarts], [grandConge2026], "2026-07");
    const tous = genererSegments([quarts], [grandConge2026], "2026-08");
    expect(seg.map((s) => s.debut.date)).toEqual(["2026-07-04", "2026-07-18"]);
    expect(tous.map((s) => s.debut.date)).toEqual(["2026-07-18", "2026-08-02", "2026-08-17"]);
    expect(tous.map((s) => s.responsableId)).toEqual(["sam", "alex", "sam"]);
    const nuits = [...seg, ...tous].flatMap((s) => s.nuits);
    expect(new Set(nuits).size).toBe(59);
  });

  it("deux blocs voisins du même responsable ne génèrent pas de remise entre eux", () => {
    const r: RegleVacances = { ...quarts, attributions: { paire: ["alex", "alex", "sam", "sam"], impaire: ["sam", "sam", "alex", "alex"] } };
    const seg = genererSegments([r], [grandConge2026], "2026-07");
    expect(seg[0]).toMatchObject({ responsableId: "alex", prise: true, remise: false });
    expect(seg[1]).toMatchObject({ responsableId: "alex", prise: false });
  });

  it("le jour de changement donne deux créneaux distincts pour un même enfant", () => {
    const c = genererCreneaux([quarts], [grandConge2026], "2026-07").filter((x) => x.enfantId === "nina" && x.date === "2026-07-18");
    expect(c.map((x) => [x.debut, x.fin])).toEqual([["00:00", "18:00"], ["18:00", "23:59"]]);
    expect(new Set(c.map((x) => x.id)).size).toBe(2);
  });
});

describe("règles dérivées", () => {
  const suitSam: RegleDerivee = {
    id: "suit-sam",
    type: "derivee",
    libelle: "Nina suit Sam",
    actif: true,
    priorite: 0,
    sourceId: "we-pair",
    suitAdulteId: "sam",
    enfantIds: ["nina"],
  };

  it("les autres enfants suivent l'adulte sur ses créneaux", () => {
    const c = genererCreneaux([weekEndPair, suitSam], [], "2026-03").filter((x) => x.enfantId === "nina");
    expect(c.map((x) => x.date)).toEqual(["2026-03-07", "2026-03-08", "2026-03-21", "2026-03-22"]);
    expect(c[0]!.origine).toEqual({ type: "regle", regleId: "suit-sam" });
  });

  it("rien n'est généré si l'adulte suivi n'est pas responsable sur la source", () => {
    expect(genererCreneaux([weekEndPair, { ...suitSam, suitAdulteId: "alex" }], [], "2026-03").filter((x) => x.enfantId === "nina")).toEqual([]);
  });

  it("suit aussi une règle de vacances, quel que soit l'ordre des règles", () => {
    const d: RegleDerivee = { ...suitSam, sourceId: "vac-moities", suitAdulteId: "alex" };
    const seg = genererSegments([d, moities], [printemps2026], "2026-04");
    const derive = seg.filter((s) => s.regleId === "suit-sam");
    expect(derive).toHaveLength(1);
    expect(derive[0]).toMatchObject({ enfantIds: ["nina"], responsableId: "alex", debut: { date: "2026-04-04" } });
  });
});

describe("priorités et chevauchements", () => {
  it("la règle prioritaire retire les enfants communs de la règle moins prioritaire", () => {
    const seg = genererSegments([weekEndImpair, moities], [printemps2026], "2026-04");
    const we = seg.filter((s) => s.regleId === "we-impair");
    // le week-end du 10 au 13 avril chevauche les vacances de Léo : il ne reste que Mila
    expect(we.find((s) => s.debut.date === "2026-04-10")!.enfantIds).toEqual(["mila"]);
    expect(we.find((s) => s.debut.date === "2026-04-24")!.enfantIds).toEqual(["leo", "mila"]);
  });

  it("inversement, un week-end prioritaire supprime le bloc de vacances concerné", () => {
    const seg = genererSegments([{ ...weekEndImpair, priorite: 9 }, moities], [printemps2026], "2026-04");
    // les deux blocs chevauchent le week-end du 10 au 13 : ils disparaissent pour Léo
    expect(seg.filter((s) => s.regleId === "vac-moities")).toEqual([]);
  });
});

describe("pureté et sérialisation", () => {
  it("ne modifie pas ses entrées et donne le même résultat après aller-retour JSON", () => {
    const regles: Regle[] = [weekEndPair, weekEndImpair, moities, quarts];
    const periodes = [printemps2026, grandConge2026];
    const figees = JSON.stringify([regles, periodes]);
    const a = genererCreneaux(regles, periodes, "2026-04");
    expect(JSON.stringify([regles, periodes])).toBe(figees);
    const b = genererCreneaux(JSON.parse(JSON.stringify(regles)), JSON.parse(JSON.stringify(periodes)), "2026-04");
    expect(b).toEqual(a);
    expect(genererCreneaux([...regles].reverse(), periodes, "2026-04")).toEqual(a);
  });

  it("refuse un mois mal formé", () => {
    expect(() => genererCreneaux([], [], "2026-13")).toThrow();
  });
});
