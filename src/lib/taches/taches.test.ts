import { describe, expect, it } from "vitest";
import { familleFictive as famille } from "../domaine/fixture-famille";
import { DepotTachesMemoire, datesRecurrence, developperOccurrences, tachesPourAdulte, type Tache } from "./index";

const HIER = "2026-11-10";
const AUJ = "2026-11-11"; // mercredi, semaine ISO 46, dimanche = 2026-11-15
const nouveau = () => new DepotTachesMemoire(famille, { maintenant: () => new Date("2026-11-11T08:00:00Z") });
const ids = (l: { tacheId: string }[]) => l.map((o) => o.tacheId);

describe("récurrences variées", () => {
  const tache = (r: NonNullable<Tache["recurrence"]>, echeance: string): Tache => ({
    id: "t", titre: "x", assigneId: "alex", echeance, recurrence: r, statut: "a_faire", creeParId: "alex",
  });

  it("mensuelle le 31 : ramenée au dernier jour du mois", () => {
    expect(datesRecurrence("2026-01-31", { frequence: "mensuelle", intervalle: 1 }, "2026-01-01", "2026-05-31")).toEqual([
      "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31",
    ]);
  });

  it("mensuelle tous les 5 mois, à cheval sur deux années, année bissextile", () => {
    expect(datesRecurrence("2027-10-29", { frequence: "mensuelle", intervalle: 5 }, "2027-01-01", "2029-12-31")).toEqual([
      "2027-10-29", "2028-03-29", "2028-08-29", "2029-01-29", "2029-06-29", "2029-11-29",
    ]);
    expect(datesRecurrence("2027-12-30", { frequence: "mensuelle", intervalle: 2 }, "2028-02-01", "2028-02-29")).toEqual(["2028-02-29"]);
  });

  it("hebdomadaire toutes les 3 semaines avec fin incluse", () => {
    expect(
      datesRecurrence("2026-12-28", { frequence: "hebdomadaire", intervalle: 3, fin: "2027-02-08" }, "2026-12-01", "2027-12-31"),
    ).toEqual(["2026-12-28", "2027-01-18", "2027-02-08"]);
  });

  it("quotidienne un jour sur deux, fenêtre au milieu de la série", () => {
    expect(datesRecurrence("2026-11-01", { frequence: "quotidienne", intervalle: 2 }, "2026-11-10", "2026-11-14")).toEqual([
      "2026-11-11", "2026-11-13",
    ]);
  });

  it("une fenêtre avant l'ancre ne donne rien", () => {
    expect(developperOccurrences(tache({ frequence: "quotidienne", intervalle: 1 }, "2026-11-20"), "2026-11-01", "2026-11-19")).toEqual([]);
  });

  it("clé stable par occurrence", () => {
    const o = developperOccurrences(tache({ frequence: "quotidienne", intervalle: 1 }, "2026-11-20"), "2026-11-20", "2026-11-21");
    expect(o.map((x) => x.cle)).toEqual(["t@2026-11-20", "t@2026-11-21"]);
  });
});

describe("validation à l'écriture", () => {
  const base = { titre: "Rendez-vous", assigneId: "sam" };
  it("refuse assigné, enfant, auteur inconnus", async () => {
    const d = nouveau();
    await expect(d.enregistrer("alex", { ...base, assigneId: "inconnu" })).rejects.toThrow(/assigné/);
    await expect(d.enregistrer("alex", { ...base, enfantId: "inconnu" })).rejects.toThrow(/Enfant/);
    await expect(d.enregistrer("inconnu", base)).rejects.toThrow(/Auteur/);
    expect(await d.lister()).toEqual([]);
  });
  it("refuse dates et récurrences invalides", async () => {
    const d = nouveau();
    await expect(d.enregistrer("alex", { ...base, echeance: "2026-02-31" })).rejects.toThrow();
    await expect(d.enregistrer("alex", { ...base, recurrence: { frequence: "quotidienne", intervalle: 1 } })).rejects.toThrow(/ancre/);
    for (const intervalle of [0, -1, 1.5]) {
      await expect(
        d.enregistrer("alex", { ...base, echeance: AUJ, recurrence: { frequence: "hebdomadaire", intervalle } }),
      ).rejects.toThrow(/Intervalle/);
    }
    await expect(
      d.enregistrer("alex", { ...base, echeance: AUJ, recurrence: { frequence: "mensuelle", intervalle: 1, fin: HIER } }),
    ).rejects.toThrow(/Fin/);
    await expect(d.enregistrer("alex", { ...base, titre: "  " })).rejects.toThrow();
  });
  it("crée avec valeurs par défaut et modifie en gardant le créateur", async () => {
    const d = nouveau();
    const t = await d.enregistrer("alex", { ...base, enfantId: "mila" });
    expect(t).toMatchObject({ statut: "a_faire", creeParId: "alex", enfantId: "mila" });
    const m = await d.enregistrer("sam", { id: t.id, titre: "Autre", assigneId: "alex" });
    expect(m).toMatchObject({ creeParId: "alex", titre: "Autre", assigneId: "alex" });
    expect(m.enfantId).toBeUndefined();
  });
});

describe("cocher une occurrence", () => {
  it("ne coche que cette occurrence de la série", async () => {
    const d = nouveau();
    const t = await d.enregistrer("alex", {
      titre: "Sortir les poubelles", assigneId: "alex", echeance: "2026-11-09", recurrence: { frequence: "quotidienne", intervalle: 1 },
    });
    await d.cocher("alex", t.id, "2026-11-10");
    const [tache] = await d.lister();
    const occ = developperOccurrences(tache!, "2026-11-09", "2026-11-11");
    expect(occ.map((o) => [o.date, o.statut])).toEqual([
      ["2026-11-09", "a_faire"], ["2026-11-10", "faite"], ["2026-11-11", "a_faire"],
    ]);
    expect(occ[1]!.faiteLe).toBe("2026-11-11T08:00:00.000Z");
    await d.decocher("alex", t.id, "2026-11-10");
    expect((await d.lister())[0]!.exceptions).toEqual([]);
  });
  it("refuse une date qui n'est pas une occurrence, ou une date sur tâche ponctuelle", async () => {
    const d = nouveau();
    const s = await d.enregistrer("alex", { titre: "s", assigneId: "alex", echeance: AUJ, recurrence: { frequence: "hebdomadaire", intervalle: 2 } });
    await expect(d.cocher("alex", s.id, "2026-11-18")).rejects.toThrow();
    await expect(d.cocher("alex", s.id)).rejects.toThrow();
    const p = await d.enregistrer("alex", { titre: "p", assigneId: "alex", echeance: AUJ });
    await expect(d.cocher("alex", p.id, AUJ)).rejects.toThrow();
    const f = await d.cocher("sam", p.id);
    expect(f).toMatchObject({ statut: "faite", faiteLe: "2026-11-11T08:00:00.000Z" });
  });
  it("changer la série écarte les exceptions orphelines", async () => {
    const d = nouveau();
    const t = await d.enregistrer("alex", { titre: "s", assigneId: "alex", echeance: AUJ, recurrence: { frequence: "quotidienne", intervalle: 1 } });
    await d.cocher("alex", t.id, "2026-11-12");
    const m = await d.enregistrer("alex", { id: t.id, titre: "s", assigneId: "alex", echeance: AUJ, recurrence: { frequence: "hebdomadaire", intervalle: 1 } });
    expect(m.exceptions).toEqual([]);
  });
});

describe("vues par adulte", () => {
  async function jeu() {
    const d = nouveau();
    const ec = (titre: string, assigneId: string, echeance?: string, extra: object = {}) =>
      d.enregistrer("alex", { titre, assigneId, ...(echeance ? { echeance } : {}), ...extra });
    return {
      d,
      retardAlex: await ec("Payer la cantine", "alex", "2026-11-03"),
      retardSam: await ec("Renouveler l'assurance", "sam", "2026-11-05"),
      auj: await ec("Réunion d'école", "alex", AUJ, { enfantId: "leo" }),
      semaineSam: await ec("Courses", "sam", "2026-11-14"),
      suivante: await ec("Dentiste", "sam", "2026-11-16"),
      libreSam: await ec("Ranger le garage", "sam"),
      serie: await ec("Cartable de Nina", "sam", "2026-11-02", { recurrence: { frequence: "hebdomadaire", intervalle: 1 } }),
    };
  }

  it("sections d'Alex", async () => {
    const { d, retardAlex, auj, semaineSam, retardSam } = await jeu();
    const v = await tachesPourAdulte(d, famille, "alex", AUJ);
    expect(ids(v.aRattraper)).toEqual([retardAlex.id]);
    expect(ids(v.aujourdhui)).toEqual([auj.id]);
    expect(v.cetteSemaine.map((o) => [o.tacheId, o.deLAutre])).toEqual([[semaineSam.id, true]]);
    expect(v.sansEcheance.map((o) => o.deLAutre)).toEqual([true]);
    expect(JSON.stringify(v)).not.toContain(retardSam.id + "@");
    expect(v.compte).toEqual({ aujourdhui: 1, cetteSemaine: 1, aRattraper: 1, sansEcheance: 1 });
  });

  it("CRITIQUE : le retard d'Alex est invisible pour Sam, partout, y compris dans les comptes", async () => {
    const { d, retardAlex } = await jeu();
    const v = await tachesPourAdulte(d, famille, "sam", AUJ);
    expect(JSON.stringify(v)).not.toContain(retardAlex.id);
    expect(JSON.stringify(v)).not.toContain("2026-11-03");
    for (const s of [v.aujourdhui, v.cetteSemaine, v.aRattraper, v.sansEcheance]) {
      expect(s.some((o) => o.tacheId === retardAlex.id)).toBe(false);
    }
    expect(v.aRattraper.every((o) => o.assigneId === "sam" && !o.deLAutre)).toBe(true);
    // Sam voit ses propres retards (tâche ponctuelle + série du 2 novembre, occurrences des 2 et 9).
    expect(v.aRattraper.map((o) => o.cle).sort()).toEqual(
      ["tache-2@2026-11-05", "tache-7@2026-11-02", "tache-7@2026-11-09"].sort(),
    );
    expect(v.compte.aRattraper).toBe(3);
  });

  it("symétrie : le retard de Sam est invisible pour Alex, même pour une série", async () => {
    const { d, serie, retardSam } = await jeu();
    const v = await tachesPourAdulte(d, famille, "alex", AUJ);
    const tout = [...v.aujourdhui, ...v.cetteSemaine, ...v.aRattraper, ...v.sansEcheance];
    expect(tout.filter((o) => o.deLAutre).every((o) => !o.date || o.date >= AUJ)).toBe(true);
    expect(tout.some((o) => o.tacheId === retardSam.id)).toBe(false);
    expect(tout.filter((o) => o.tacheId === serie.id)).toEqual([]);
  });

  it("une tâche de l'autre non en retard reste visible, marquée deLAutre", async () => {
    const d = nouveau();
    await d.enregistrer("alex", { titre: "Spectacle", assigneId: "sam", echeance: AUJ });
    const v = await tachesPourAdulte(d, famille, "alex", AUJ);
    expect(v.aujourdhui).toHaveLength(1);
    expect(v.aujourdhui[0]!.deLAutre).toBe(true);
    expect(v.aRattraper).toEqual([]);
  });

  it("la tâche faite sort du retard ; une occurrence cochée sort, les autres restent", async () => {
    const { d, retardAlex, serie } = await jeu();
    await d.cocher("sam", retardAlex.id);
    await d.cocher("sam", serie.id, "2026-11-02");
    const a = await tachesPourAdulte(d, famille, "alex", AUJ);
    expect(a.aRattraper).toEqual([]);
    const s = await tachesPourAdulte(d, famille, "sam", AUJ);
    expect(s.aRattraper.map((o) => o.cle)).toContain("tache-7@2026-11-09");
    expect(s.aRattraper.map((o) => o.cle)).not.toContain("tache-7@2026-11-02");
  });

  it("dimanche : la semaine restante est vide ; lundi : jusqu'au dimanche", async () => {
    const d = nouveau();
    await d.enregistrer("alex", { titre: "a", assigneId: "alex", echeance: "2026-11-16" });
    expect((await tachesPourAdulte(d, famille, "alex", "2026-11-15")).cetteSemaine).toEqual([]);
    expect((await tachesPourAdulte(d, famille, "alex", "2026-11-16")).aujourdhui).toHaveLength(1);
    expect((await tachesPourAdulte(d, famille, "alex", "2026-11-09")).cetteSemaine).toEqual([]);
  });

  it("limite de rattrapage paramétrable, et demandeur inconnu refusé", async () => {
    const d = nouveau();
    await d.enregistrer("alex", { titre: "q", assigneId: "alex", echeance: "2026-11-01", recurrence: { frequence: "quotidienne", intervalle: 1 } });
    const v = await tachesPourAdulte(d, famille, "alex", AUJ, { joursRattrapage: 3 });
    expect(v.aRattraper.map((o) => o.date)).toEqual(["2026-11-08", "2026-11-09", "2026-11-10"]);
    await expect(tachesPourAdulte(d, famille, "inconnu", AUJ)).rejects.toThrow(/inconnu/);
  });
});

it("une tâche ponctuelle très ancienne reste à rattraper", async () => {
  const d = nouveau();
  await d.enregistrer("sam", { titre: "Vieille", assigneId: "sam", echeance: "2025-01-15" });
  expect((await tachesPourAdulte(d, famille, "sam", AUJ)).compte.aRattraper).toBe(1);
  expect((await tachesPourAdulte(d, famille, "alex", AUJ)).compte.aRattraper).toBe(0);
});
