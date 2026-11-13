import { describe, expect, it } from "vitest";
import { ErreurDomaine } from "../domaine/depot";
import { familleFictive as famille } from "../domaine/fixture-famille";
import { DepotTachesMemoire, datesRecurrence, tachesPourAdulte } from "./index";

const AUJ = "2026-11-11"; // mercredi, dimanche = 2026-11-15
const nouveau = () => new DepotTachesMemoire(famille, { maintenant: () => new Date("2026-11-11T08:00:00Z") });
const QUOTIDIENNE = { frequence: "quotidienne", intervalle: 1 } as const;

describe("robustesse des dates et intervalles", () => {
  it("cocher/décocher refusent une date invalide, sans boucler", async () => {
    const d = nouveau();
    const t = await d.enregistrer("alex", { titre: "q", assigneId: "alex", echeance: AUJ, recurrence: QUOTIDIENNE });
    for (const date of ["9999-99-99", "2026-02-31", "pas une date", "", "+275760-09-13"]) {
      await expect(d.cocher("alex", t.id, date)).rejects.toThrow(/Date/);
      await expect(d.decocher("alex", t.id, date)).rejects.toThrow(/Date/);
    }
  });

  it("datesRecurrence refuse intervalle ou bornes invalides au lieu de boucler", () => {
    for (const intervalle of [0, -2, 1.5, Number.NaN]) {
      expect(() => datesRecurrence(AUJ, { frequence: "quotidienne", intervalle }, AUJ, "2026-12-01")).toThrow(ErreurDomaine);
    }
    expect(() => datesRecurrence(AUJ, QUOTIDIENNE, AUJ, "9999-99-99")).toThrow(ErreurDomaine);
    expect(() => datesRecurrence("2026-02-31", QUOTIDIENNE, AUJ, AUJ)).toThrow(ErreurDomaine);
  });

  it("une ancre très ancienne n'oblige pas à parcourir toute la série", () => {
    expect(datesRecurrence("1900-01-01", QUOTIDIENNE, "2026-11-10", "2026-11-11")).toEqual(["2026-11-10", "2026-11-11"]);
    expect(datesRecurrence("1900-01-31", { frequence: "mensuelle", intervalle: 1 }, "2026-02-01", "2026-02-28")).toEqual(["2026-02-28"]);
    const h = datesRecurrence("1900-01-01", { frequence: "hebdomadaire", intervalle: 3 }, "2026-11-01", "2026-11-30");
    expect(h.length).toBeGreaterThan(0);
    expect(h.every((x) => x >= "2026-11-01" && x <= "2026-11-30")).toBe(true);
  });

  it("joursRattrapage invalide refusé", async () => {
    const d = nouveau();
    for (const j of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(tachesPourAdulte(d, famille, "alex", AUJ, { joursRattrapage: j })).rejects.toThrow(/joursRattrapage/);
    }
  });
});

describe("écritures : pas de fuite du retard", () => {
  async function retards() {
    const d = nouveau(); // aujourd'hui = 2026-11-11
    const ponctuelle = await d.enregistrer("alex", { titre: "Payer la cantine", assigneId: "alex", echeance: "2026-11-03" });
    const serie = await d.enregistrer("alex", { titre: "Cartable", assigneId: "alex", echeance: "2026-11-02", recurrence: QUOTIDIENNE });
    const ponctuelleSam = await d.enregistrer("sam", { titre: "Assurance", assigneId: "sam", echeance: "2026-11-03" });
    const serieSam = await d.enregistrer("sam", { titre: "Devoirs", assigneId: "sam", echeance: "2026-11-02", recurrence: QUOTIDIENNE });
    return { d, ponctuelle, serie, ponctuelleSam, serieSam };
  }

  it("Sam (non assigné) ne peut ni cocher ni décocher le passé d'Alex, ponctuel ou série", async () => {
    const { d, ponctuelle, serie } = await retards();
    await expect(d.cocher("sam", ponctuelle.id)).rejects.toThrow(ErreurDomaine);
    await expect(d.decocher("sam", ponctuelle.id)).rejects.toThrow(ErreurDomaine);
    await expect(d.cocher("sam", serie.id, "2026-11-05")).rejects.toThrow(ErreurDomaine);
    await expect(d.decocher("sam", serie.id, "2026-11-05")).rejects.toThrow(ErreurDomaine);
    // Même refus pour une date qui n'est pas une occurrence : pas d'oracle.
    await expect(d.cocher("sam", serie.id, "2020-01-01")).rejects.toThrow(/réservé/);
    const brut = await d.lister();
    expect(brut.find((t) => t.id === ponctuelle.id)!.statut).toBe("a_faire");
    expect(brut.find((t) => t.id === serie.id)!.exceptions ?? []).toEqual([]);
  });

  it("symétrie : Alex ne peut pas cocher le passé de Sam", async () => {
    const { d, ponctuelleSam, serieSam } = await retards();
    await expect(d.cocher("alex", ponctuelleSam.id)).rejects.toThrow(/réservé/);
    await expect(d.cocher("alex", serieSam.id, "2026-11-05")).rejects.toThrow(/réservé/);
  });

  it("l'assigné coche son passé ; l'autre adulte coche aujourd'hui et l'avenir", async () => {
    const { d, ponctuelle, serie } = await retards();
    await d.cocher("alex", ponctuelle.id);
    await d.cocher("alex", serie.id, "2026-11-05");
    await d.cocher("sam", serie.id, AUJ);
    await d.cocher("sam", serie.id, "2026-11-12");
    await d.decocher("sam", serie.id, "2026-11-12");
    const ex = (await d.lister()).find((t) => t.id === serie.id)!.exceptions!;
    expect(ex.map((e) => e.date)).toEqual(["2026-11-05", AUJ]);
  });

  it("une tâche sans échéance reste cochable par l'autre adulte", async () => {
    const d = nouveau();
    const t = await d.enregistrer("alex", { titre: "Ranger", assigneId: "alex" });
    await d.cocher("sam", t.id);
    expect((await d.lister())[0]!.statut).toBe("faite");
  });

  it("les écritures ne renvoient jamais la tâche brute", async () => {
    const { d, ponctuelleSam, serieSam } = await retards();
    const retours = [
      await d.cocher("alex", serieSam.id, AUJ),
      await d.decocher("alex", serieSam.id, AUJ),
      await d.enregistrer("alex", { id: ponctuelleSam.id, titre: "Assurance", assigneId: "sam", echeance: "2026-11-03" }),
      await d.enregistrer("alex", { id: serieSam.id, titre: "Devoirs", assigneId: "sam", echeance: "2026-11-02", recurrence: QUOTIDIENNE }),
    ];
    for (const r of retours) {
      const txt = JSON.stringify(r);
      for (const interdit of ["2026-11-03", "2026-11-02", "statut", "exceptions", "creeParId", "faiteLe", "echeance"]) {
        expect(txt).not.toContain(interdit);
      }
      expect(Object.keys(r).every((k) => k === "id" || k === "cle")).toBe(true);
    }
  });
});

describe("enregistrer : liste blanche de champs", () => {
  it("ignore creeParId, statut, faiteLe, exceptions et champs inconnus (création)", async () => {
    const d = nouveau();
    const sale = {
      titre: "T", assigneId: "alex", creeParId: "sam", statut: "faite", faiteLe: "2020-01-01T00:00:00Z",
      exceptions: [{ date: AUJ, faiteLe: "x" }], intrus: 1,
    } as never;
    await d.enregistrer("alex", sale);
    const [t] = await d.lister();
    expect(t).toEqual({ id: t!.id, titre: "T", assigneId: "alex", statut: "a_faire", creeParId: "alex" });
  });

  it("ne modifie pas ces champs à la modification, et filtre les sous-champs de récurrence", async () => {
    const d = nouveau();
    const { id } = await d.enregistrer("alex", { titre: "S", assigneId: "alex", echeance: AUJ, recurrence: QUOTIDIENNE });
    await d.cocher("alex", id, AUJ);
    const avant = (await d.lister())[0]!;
    await d.enregistrer("sam", {
      id, titre: "S2", assigneId: "alex", echeance: AUJ, creeParId: "sam", statut: "faite", faiteLe: "2020-01-01T00:00:00Z",
      exceptions: [], recurrence: { ...QUOTIDIENNE, extra: true },
    } as never);
    const apres = (await d.lister())[0]!;
    expect(apres).toEqual({ ...avant, titre: "S2" });
    expect(apres.recurrence).toEqual(QUOTIDIENNE);
  });

  it("changer ponctuel <-> série remet le statut à zéro", async () => {
    const d = nouveau();
    const { id } = await d.enregistrer("alex", { titre: "P", assigneId: "alex", echeance: AUJ });
    await d.cocher("alex", id);
    expect((await d.lister())[0]!.statut).toBe("faite");
    await d.enregistrer("alex", { id, titre: "P", assigneId: "alex", echeance: AUJ, recurrence: { frequence: "hebdomadaire", intervalle: 1 } });
    expect((await d.lister())[0]).toMatchObject({ statut: "a_faire" });
    expect((await d.lister())[0]!.faiteLe).toBeUndefined();
    await d.cocher("alex", id, AUJ);
    await d.enregistrer("alex", { id, titre: "P", assigneId: "alex", echeance: AUJ });
    expect((await d.lister())[0]).toMatchObject({ statut: "a_faire" });
    expect((await d.lister())[0]!.exceptions).toBeUndefined();
  });
});

describe("symétrie du retard sur des séries quotidiennes", () => {
  for (const [demandeur, autre] of [["alex", "sam"], ["sam", "alex"]] as const) {
    it(`${demandeur} voit le jour et la semaine de ${autre}, aucune occurrence passée de ${autre}`, async () => {
      const d = nouveau();
      // Séries quotidiennes depuis le 2 novembre, jamais cochées : du retard pour chacun.
      await d.enregistrer("alex", { titre: "Série d'Alex", assigneId: "alex", echeance: "2026-11-02", recurrence: QUOTIDIENNE });
      await d.enregistrer("sam", { titre: "Série de Sam", assigneId: "sam", echeance: "2026-11-02", recurrence: QUOTIDIENNE });
      const v = await tachesPourAdulte(d, famille, demandeur, AUJ);
      const deAutre = (l: typeof v.aujourdhui) => l.filter((o) => o.deLAutre);
      expect(deAutre(v.aujourdhui).map((o) => o.date)).toEqual([AUJ]);
      expect(deAutre(v.cetteSemaine).map((o) => o.date)).toEqual(["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
      expect(v.aRattraper.every((o) => o.assigneId === demandeur && !o.deLAutre)).toBe(true);
      expect(v.aRattraper.map((o) => o.date)).toEqual(
        ["02", "03", "04", "05", "06", "07", "08", "09", "10"].map((j) => `2026-11-${j}`),
      );
      const passesAutre = [...v.aujourdhui, ...v.cetteSemaine, ...v.aRattraper, ...v.sansEcheance].filter(
        (o) => o.assigneId === autre && o.date! < AUJ,
      );
      expect(passesAutre).toEqual([]);
      // Comptes : 1 + 1 pour aujourd'hui, 4 + 4 pour la semaine, 9 retards du demandeur seulement.
      expect(v.compte).toEqual({ aujourdhui: 2, cetteSemaine: 8, aRattraper: 9, sansEcheance: 0 });
    });
  }
});
