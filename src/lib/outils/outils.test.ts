import { beforeEach, describe, expect, it } from "vitest";
import { DepotMemoire } from "../domaine/depot-memoire";
import { ErreurDomaine } from "../domaine/depot";
import { familleFictive } from "../domaine/fixture-famille";
import { appliquerMotif, dupliquerSemaine, echangerDeuxJours, type JourMotif } from "./outils";

let t = 0;
let depot: DepotMemoire;
beforeEach(() => {
  t = 0;
  depot = new DepotMemoire(familleFictive, { maintenant: () => new Date(Date.UTC(2026, 0, 1, 12, 0, t++)) });
});

// Motif fictif de 3 jours, volontairement non réaliste : Alex, Alex, Sam.
const motifAAB: JourMotif[] = [
  { responsableId: "alex", lieuId: "dom-alex" },
  { responsableId: "alex", lieuId: "grands-parents" },
  { responsableId: "sam", lieuId: "dom-sam" },
];

describe("appliquerMotif", () => {
  it("répète le cycle sur la plage pour tous les enfants, sans marque de règle", async () => {
    const r = await appliquerMotif(depot, "alex", motifAAB, "2026-03-02", "2026-03-08");
    expect(r).toMatchObject({ gardes: 21, presences: 21 });
    const gardes = await depot.listerGardes({ enfantId: "mila" });
    expect(gardes.map((g) => g.responsableId)).toEqual(["alex", "alex", "sam", "alex", "alex", "sam", "alex"]);
    const pres = await depot.listerPresences({ enfantId: "nina", du: "2026-03-04", au: "2026-03-04" });
    expect(pres[0]!.lieuId).toBe("dom-sam");
    expect((await depot.listerGardes()).some((g) => g.origine)).toBe(false);
    expect((await depot.listerPresences()).some((p) => p.origine)).toBe(false);
  });

  it("journalise et notifie l'autre adulte seulement", async () => {
    await appliquerMotif(depot, "alex", motifAAB, "2026-03-02", "2026-03-02", ["leo"]);
    expect((await depot.lireJournal()).every((e) => e.auteurId === "alex")).toBe(true);
    expect((await depot.evenementsANotifier("sam")).length).toBe(2);
    expect(await depot.evenementsANotifier("alex")).toEqual([]);
  });

  it("transforme une garde issue d'une règle en saisie à la main", async () => {
    await depot.definirGarde("sam", { enfantId: "leo", date: "2026-03-02", responsableId: "sam", origine: "regle" });
    await appliquerMotif(depot, "alex", motifAAB, "2026-03-02", "2026-03-02", ["leo"]);
    const [g] = await depot.listerGardes({ enfantId: "leo" });
    expect(g).toEqual({ enfantId: "leo", date: "2026-03-02", responsableId: "alex" });
  });

  it("est sans effet à la relance", async () => {
    await appliquerMotif(depot, "alex", motifAAB, "2026-03-02", "2026-03-08");
    const n = (await depot.lireJournal()).length;
    const r = await appliquerMotif(depot, "alex", motifAAB, "2026-03-02", "2026-03-08");
    expect(r).toMatchObject({ gardes: 0, presences: 0 });
    expect((await depot.lireJournal()).length).toBe(n);
  });

  it.each([
    ["motif vide", [], "2026-03-02", "2026-03-03"],
    ["fin avant début", motifAAB, "2026-03-03", "2026-03-02"],
    ["date impossible", motifAAB, "2026-02-30", "2026-03-02"],
    ["plage trop longue", motifAAB, "2026-01-01", "2027-06-01"],
    ["adulte inconnu au 3e jour", [motifAAB[0]!, motifAAB[1]!, { responsableId: "inconnu", lieuId: "parc" }], "2026-03-02", "2026-03-05"],
    ["lieu inconnu au 2e jour", [motifAAB[0]!, { responsableId: "sam", lieuId: "lune" }], "2026-03-02", "2026-03-05"],
  ])("refuse sans rien écrire : %s", async (_n, motif, debut, fin) => {
    await expect(appliquerMotif(depot, "alex", motif, debut, fin)).rejects.toBeInstanceOf(ErreurDomaine);
    expect(await depot.listerGardes()).toEqual([]);
    expect(await depot.lireJournal()).toEqual([]);
  });

  it("refuse un auteur ou un enfant inconnu", async () => {
    await expect(appliquerMotif(depot, "inconnu", motifAAB, "2026-03-02", "2026-03-03")).rejects.toThrow(/Adulte/);
    await expect(appliquerMotif(depot, "alex", motifAAB, "2026-03-02", "2026-03-03", ["max"])).rejects.toThrow(/Enfant/);
  });
});

describe("dupliquerSemaine", () => {
  beforeEach(async () => {
    await appliquerMotif(depot, "alex", motifAAB, "2026-03-02", "2026-03-08", ["leo", "mila"]);
    await depot.enregistrerTransfert("alex", {
      date: "2026-03-04", heure: "18:00", lieuId: "parc", deposeId: "alex", recupereId: "sam", enfantIds: ["leo", "mila"],
    });
    // Hors de la semaine source : ne doit pas être copié.
    await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-09", responsableId: "sam" });
  });

  it("copie gardes, présences et transferts en décalant les dates", async () => {
    const r = await dupliquerSemaine(depot, "sam", "2026-03-02", "2026-03-16");
    expect(r).toMatchObject({ gardes: 14, presences: 14, transferts: 1 });
    const g = await depot.listerGardes({ enfantId: "leo", du: "2026-03-16", au: "2026-03-22" });
    expect(g.map((x) => x.date)).toEqual(["2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19", "2026-03-20", "2026-03-21", "2026-03-22"]);
    expect(g.map((x) => x.responsableId)).toEqual(["alex", "alex", "sam", "alex", "alex", "sam", "alex"]);
    const tr = await depot.listerTransferts({ du: "2026-03-16", au: "2026-03-22" });
    expect(tr).toHaveLength(1);
    expect(tr[0]).toMatchObject({ date: "2026-03-18", heure: "18:00", enfantIds: ["leo", "mila"] });
    expect(await depot.listerGardes({ du: "2026-03-23" })).toEqual([]);
    expect((await depot.evenementsANotifier("alex")).length).toBeGreaterThan(0);
  });

  it("retire la marque de règle des copies et remplace l'existant", async () => {
    await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-02", responsableId: "alex", origine: "regle" });
    await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-23", responsableId: "sam" });
    await dupliquerSemaine(depot, "alex", "2026-03-02", "2026-03-23");
    const [g] = await depot.listerGardes({ enfantId: "leo", du: "2026-03-23", au: "2026-03-23" });
    expect(g).toEqual({ enfantId: "leo", date: "2026-03-23", responsableId: "alex" });
  });

  it("peut copier vers une semaine antérieure et ne duplique pas à la relance", async () => {
    await dupliquerSemaine(depot, "alex", "2026-03-02", "2026-02-23");
    const n = (await depot.lireJournal()).length;
    const r = await dupliquerSemaine(depot, "alex", "2026-03-02", "2026-02-23");
    expect(r).toMatchObject({ gardes: 0, presences: 0, transferts: 0 });
    expect((await depot.lireJournal()).length).toBe(n);
    expect(await depot.listerTransferts({ du: "2026-02-23", au: "2026-03-01" })).toHaveLength(1);
  });

  it("refuse sans écrire : non-lundi, identiques, source vide, auteur inconnu", async () => {
    const n = (await depot.lireJournal()).length;
    await expect(dupliquerSemaine(depot, "alex", "2026-03-03", "2026-03-16")).rejects.toThrow(/lundi/);
    await expect(dupliquerSemaine(depot, "alex", "2026-03-02", "2026-03-17")).rejects.toThrow(/lundi/);
    await expect(dupliquerSemaine(depot, "alex", "2026-03-02", "2026-03-02")).rejects.toThrow(/identiques/);
    await expect(dupliquerSemaine(depot, "alex", "2026-06-01", "2026-06-08")).rejects.toThrow(/Rien à copier/);
    await expect(dupliquerSemaine(depot, "inconnu", "2026-03-02", "2026-03-16")).rejects.toThrow(/Adulte/);
    expect((await depot.lireJournal()).length).toBe(n);
  });
});

describe("echangerDeuxJours", () => {
  beforeEach(async () => {
    await appliquerMotif(depot, "alex", motifAAB, "2026-03-02", "2026-03-04"); // lun A, mar A, mer S
  });

  it("permute gardes et présences de tous les enfants", async () => {
    const r = await echangerDeuxJours(depot, "sam", "2026-03-02", "2026-03-04");
    expect(r).toMatchObject({ gardes: 3, presences: 3 });
    const [g1, , g3] = await depot.listerGardes({ enfantId: "nina" });
    expect([g1!.responsableId, g3!.responsableId]).toEqual(["sam", "alex"]);
    const p = await depot.listerPresences({ enfantId: "nina", du: "2026-03-02", au: "2026-03-02" });
    expect(p[0]!.lieuId).toBe("dom-sam");
    expect((await depot.evenementsANotifier("alex")).length).toBeGreaterThan(0);
  });

  it("ne touche que les enfants indiqués", async () => {
    await echangerDeuxJours(depot, "alex", "2026-03-02", "2026-03-04", ["leo"]);
    const mila = await depot.listerGardes({ enfantId: "mila", du: "2026-03-02", au: "2026-03-02" });
    expect(mila[0]!.responsableId).toBe("alex");
    const leo = await depot.listerGardes({ enfantId: "leo", du: "2026-03-02", au: "2026-03-02" });
    expect(leo[0]!.responsableId).toBe("sam");
  });

  it("déplace l'entrée quand l'autre jour est vide", async () => {
    await echangerDeuxJours(depot, "alex", "2026-03-04", "2026-03-10", ["leo"]);
    expect(await depot.listerGardes({ enfantId: "leo", du: "2026-03-04", au: "2026-03-04" })).toEqual([]);
    const [g] = await depot.listerGardes({ enfantId: "leo", du: "2026-03-10", au: "2026-03-10" });
    expect(g).toEqual({ enfantId: "leo", date: "2026-03-10", responsableId: "sam" });
  });

  it("efface la marque de règle et signale un écart sur les créneaux de règle", async () => {
    await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-04", responsableId: "sam", origine: "regle" });
    await depot.enregistrerCreneau("alex", {
      id: "rg:x", enfantId: "leo", date: "2026-03-02", debut: "08:00", fin: "09:00", libelle: "Passage",
      origine: { type: "regle", regleId: "we-fictif" },
    });
    await depot.enregistrerCreneau("alex", {
      id: "manuel", enfantId: "leo", date: "2026-03-02", debut: "10:00", fin: "11:00", libelle: "Dessin",
    });
    await depot.enregistrerCreneau("alex", {
      id: "rg:y", enfantId: "mila", date: "2026-03-04", debut: "08:00", fin: "09:00", libelle: "Autre enfant",
      origine: { type: "regle", regleId: "we-fictif" },
    });
    const r = await echangerDeuxJours(depot, "alex", "2026-03-02", "2026-03-04", ["leo"]);
    expect(r.creneauxSignales).toBe(1);
    const cr = await depot.listerCreneaux();
    expect(cr.find((c) => c.id === "rg:x")!.origine!.ecart).toMatch(/2026-03-04/);
    expect(cr.find((c) => c.id === "rg:x")!.date).toBe("2026-03-02");
    expect(cr.find((c) => c.id === "manuel")!.origine).toBeUndefined();
    expect(cr.find((c) => c.id === "rg:y")!.origine!.ecart).toBeUndefined();
    expect((await depot.listerGardes()).some((g) => g.origine)).toBe(false);
  });

  it("refuse sans rien écrire", async () => {
    const n = (await depot.lireJournal()).length;
    await expect(echangerDeuxJours(depot, "alex", "2026-03-02", "2026-03-02")).rejects.toThrow(/identiques/);
    await expect(echangerDeuxJours(depot, "alex", "2026-03-02", "2026-13-01")).rejects.toThrow(/Date/);
    await expect(echangerDeuxJours(depot, "alex", "2026-03-02", "2026-03-04", ["max"])).rejects.toThrow(/Enfant/);
    await expect(echangerDeuxJours(depot, "alex", "2026-03-02", "2026-03-04", [])).rejects.toThrow(/enfant/);
    await expect(echangerDeuxJours(depot, "alex", "2026-07-01", "2026-07-02")).rejects.toThrow(/Rien/);
    expect((await depot.lireJournal()).length).toBe(n);
  });
});
