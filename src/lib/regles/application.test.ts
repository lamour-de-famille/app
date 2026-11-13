import { beforeEach, describe, expect, it } from "vitest";
import { DepotMemoire } from "../domaine/depot-memoire";
import { ErreurDomaine } from "../domaine/depot";
import { familleFictive } from "../domaine/fixture-famille";
import { appliquerRegles, deplacerCreneau } from "./application";
import { genererCreneaux } from "./moteur";
import type { PeriodeVacances, Regle, RegleDerivee, RegleVacances, RegleWeekEnd } from "./types";

let t = 0;
let depot: DepotMemoire;
beforeEach(() => {
  t = 0;
  depot = new DepotMemoire(familleFictive, { maintenant: () => new Date(Date.UTC(2026, 0, 1, 12, 0, t++)) });
});

// Règles fictives, volontairement non réalistes.
const wePair: RegleWeekEnd = {
  id: "we-pair",
  type: "week_end",
  libelle: "Paires : samedi 10:00 au dimanche 17:00",
  actif: true,
  priorite: 0,
  parite: "paire",
  responsableId: "sam",
  enfantIds: ["leo", "mila"],
  debut: { jour: 6, heure: "10:00" },
  fin: { jour: 7, heure: "17:00" },
};
const weImpair: RegleWeekEnd = {
  ...wePair,
  id: "we-impair",
  libelle: "Impaires : vendredi 18:00 au lundi 08:30",
  parite: "impaire",
  responsableId: "alex",
  debut: { jour: 5, heure: "18:00" },
  fin: { jour: 1, heure: "08:30" },
  lieuTransfertId: "parc",
};
const suitSam: RegleDerivee = {
  id: "nina-suit-sam",
  type: "derivee",
  libelle: "Nina suit Sam",
  actif: true,
  priorite: 0,
  sourceId: "we-pair",
  suitAdulteId: "sam",
  enfantIds: ["nina"],
};
const moities: RegleVacances = {
  id: "vac-moities",
  type: "vacances",
  libelle: "Congés en moitiés",
  actif: true,
  priorite: 5,
  nomContient: "printemps",
  parts: 2,
  attributions: { paire: ["alex", "sam"], impaire: ["sam", "alex"] },
  enfantIds: ["leo", "mila", "nina"],
  departDecompte: "jour_officiel",
  heureChangement: "18:00",
  anneeReference: "debut",
};
const printemps: PeriodeVacances = { nom: "Printemps fictif", debut: "2026-04-04", fin: "2026-04-18", zone: "Z-test" };

async function poser(...regles: Regle[]) {
  for (const r of regles) await depot.enregistrerRegle("alex", r);
}

describe("règles stockées dans le dépôt", () => {
  it("enregistre, relit (copie JSON), remplace et supprime ; journalise", async () => {
    await poser(wePair, suitSam);
    const lues = await depot.listerRegles();
    expect(lues.map((r) => r.id)).toEqual(["we-pair", "nina-suit-sam"]);
    expect(JSON.parse(JSON.stringify(lues))).toEqual(lues);
    await depot.enregistrerRegle("sam", { ...wePair, parite: "impaire" });
    expect((await depot.listerRegles())[0]).toMatchObject({ parite: "impaire" });
    const j = await depot.lireJournal();
    expect(j.at(-1)).toMatchObject({ entite: "regle", cle: "we-pair", action: "modification", auteurId: "sam" });
    await depot.supprimerRegle("sam", "nina-suit-sam");
    expect(await depot.listerRegles()).toHaveLength(1);
    await expect(depot.supprimerRegle("sam", "nina-suit-sam")).rejects.toThrow(ErreurDomaine);
  });

  it("refuse les règles invalides", async () => {
    const mauvaises: Array<[string, Regle]> = [
      ["adulte inconnu", { ...wePair, responsableId: "intrus" }],
      ["enfant inconnu", { ...wePair, enfantIds: ["inconnu"] }],
      ["aucun enfant", { ...wePair, enfantIds: [] }],
      ["jour hors 1..7", { ...wePair, debut: { jour: 8 as never, heure: "10:00" } }],
      ["heure invalide", { ...wePair, fin: { jour: 7, heure: "25:00" } }],
      ["parité inconnue", { ...wePair, parite: "tierce" as never }],
      ["lieu inconnu", { ...wePair, lieuTransfertId: "nulle-part" }],
      ["id vide", { ...wePair, id: "" }],
      ["id avec deux-points", { ...wePair, id: "a:b" }],
      ["parts incohérentes", { ...moities, attributions: { paire: ["alex"], impaire: ["sam", "alex"] } }],
      ["attribution à un inconnu", { ...moities, attributions: { paire: ["alex", "x"], impaire: ["sam", "alex"] } }],
      ["parts nulles", { ...moities, parts: 0, attributions: { paire: [], impaire: [] } }],
      ["départ inconnu", { ...moities, departDecompte: "surlendemain" as never }],
      ["dérivée sans source", suitSam],
    ];
    for (const [nom, r] of mauvaises) {
      await expect(depot.enregistrerRegle("alex", r), nom).rejects.toThrow(ErreurDomaine);
    }
    expect(await depot.listerRegles()).toEqual([]);
  });

  it("refuse une dérivée dont la source est elle-même dérivée ou supprimée sous elle", async () => {
    await poser(wePair, suitSam);
    await expect(
      depot.enregistrerRegle("alex", { ...suitSam, id: "chaine", sourceId: "nina-suit-sam" }),
    ).rejects.toThrow(ErreurDomaine);
    await expect(depot.supprimerRegle("alex", "we-pair")).rejects.toThrow(/nina-suit-sam/);
  });
});

describe("application d'un mois", () => {
  it("écrit gardes, présences, transferts et créneaux marqués", async () => {
    await poser(wePair, suitSam);
    const r = await appliquerRegles(depot, "alex", "2026-03", []);
    expect(r.creneauxEcrits).toBe(12); // 2 week-ends × 2 jours × 3 enfants
    const gardes = await depot.listerGardes({ enfantId: "nina" });
    expect(gardes.map((g) => `${g.date}:${g.responsableId}`)).toEqual([
      "2026-03-07:sam",
      "2026-03-08:sam",
      "2026-03-21:sam",
      "2026-03-22:sam",
    ]);
    const presences = await depot.listerPresences({ enfantId: "nina" });
    expect(presences).toEqual([
      { enfantId: "nina", date: "2026-03-07", lieuId: "dom-sam", origine: "regle" },
      { enfantId: "nina", date: "2026-03-21", lieuId: "dom-sam", origine: "regle" },
    ]);
    const transferts = await depot.listerTransferts();
    expect(transferts.map((x) => [x.date, x.heure, x.deposeId, x.recupereId, x.lieuId])).toEqual([
      ["2026-03-07", "10:00", "alex", "sam", "dom-sam"],
      ["2026-03-08", "17:00", "sam", "alex", "dom-alex"],
      ["2026-03-21", "10:00", "alex", "sam", "dom-sam"],
      ["2026-03-22", "17:00", "sam", "alex", "dom-alex"],
    ]);
    expect(transferts[0]!.enfantIds).toEqual(["leo", "mila", "nina"]);
    const creneaux = await depot.listerCreneaux();
    expect(creneaux.every((c) => c.origine?.type === "regle")).toBe(true);
  });

  it("est idempotente : relancer ne duplique rien et ne journalise rien", async () => {
    await poser(wePair, weImpair, suitSam, moities);
    await appliquerRegles(depot, "alex", "2026-04", [printemps]);
    const avant = {
      c: await depot.listerCreneaux(),
      g: await depot.listerGardes(),
      p: await depot.listerPresences(),
      t: await depot.listerTransferts(),
      j: (await depot.lireJournal()).length,
    };
    const r2 = await appliquerRegles(depot, "alex", "2026-04", [printemps]);
    expect(r2).toMatchObject({ creneauxEcrits: 0, creneauxSupprimes: 0 });
    expect(await depot.listerCreneaux()).toEqual(avant.c);
    expect(await depot.listerGardes()).toEqual(avant.g);
    expect(await depot.listerPresences()).toEqual(avant.p);
    expect(await depot.listerTransferts()).toEqual(avant.t);
    expect((await depot.lireJournal()).length).toBe(avant.j);
  });

  it("un week-end à cheval sur deux mois est cohérent quel que soit l'ordre d'application", async () => {
    await poser(weImpair);
    await appliquerRegles(depot, "alex", "2026-02", []);
    await appliquerRegles(depot, "alex", "2026-03", []);
    const a = await depot.listerCreneaux({ enfantId: "leo", du: "2026-02-27", au: "2026-03-02" });
    expect(a.map((c) => `${c.date} ${c.debut}-${c.fin}`)).toEqual([
      "2026-02-27 18:00-23:59",
      "2026-02-28 00:00-23:59",
      "2026-03-01 00:00-23:59",
      "2026-03-02 00:00-08:30",
    ]);
    const l = await depot.listerTransferts({ du: "2026-02-27", au: "2026-03-02" });
    expect(l.map((x) => x.lieuId)).toEqual(["parc", "parc"]);
  });

  it("retire les créneaux devenus obsolètes quand la règle change", async () => {
    await poser(wePair);
    await appliquerRegles(depot, "alex", "2026-03", []);
    await depot.enregistrerRegle("alex", { ...wePair, parite: "impaire" });
    const r = await appliquerRegles(depot, "alex", "2026-03", []);
    expect(r.creneauxSupprimes).toBe(8);
    const dates = (await depot.listerCreneaux({ enfantId: "leo" })).map((c) => c.date);
    expect(dates).toEqual(["2026-03-01", "2026-03-14", "2026-03-15", "2026-03-28", "2026-03-29"]);
    const tr = await depot.listerTransferts();
    expect(tr.map((x) => x.date)).toEqual(["2026-03-01", "2026-03-14", "2026-03-15", "2026-03-28", "2026-03-29"]);
  });

  it("désactivation puis changement de parité : plus aucune garde ni présence périmée", async () => {
    await poser(wePair, suitSam);
    await appliquerRegles(depot, "alex", "2026-03", []);
    expect(await depot.listerGardes()).toHaveLength(12);
    expect(await depot.listerPresences()).toHaveLength(6);

    await depot.enregistrerRegle("alex", { ...wePair, actif: false });
    const r1 = await appliquerRegles(depot, "alex", "2026-03", []);
    expect(r1).toMatchObject({ gardesSupprimees: 12, presencesSupprimees: 6 });
    expect(await depot.listerGardes()).toEqual([]);
    expect(await depot.listerPresences()).toEqual([]);

    await depot.enregistrerRegle("alex", { ...wePair, actif: true, parite: "impaire" });
    await appliquerRegles(depot, "alex", "2026-03", []);
    const g = await depot.listerGardes({ enfantId: "leo" });
    expect(g.map((x) => x.date)).toEqual(["2026-03-01", "2026-03-14", "2026-03-15", "2026-03-28", "2026-03-29"]);
    const p = await depot.listerPresences({ enfantId: "leo" });
    expect(p.map((x) => x.date)).toEqual(["2026-03-14", "2026-03-28"]);
    // nina suit sam : mêmes jours que la règle corrigée, aucun jour de l'ancienne parité
    const n = (await depot.listerGardes({ enfantId: "nina" })).map((x) => x.date);
    expect(n).toEqual(["2026-03-01", "2026-03-14", "2026-03-15", "2026-03-28", "2026-03-29"]);
  });

  it("ne touche pas aux gardes et présences saisies à la main, ni aux créneaux déplacés", async () => {
    await poser(wePair);
    await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-10", responsableId: "sam" });
    await depot.definirPresence("alex", { enfantId: "leo", date: "2026-03-10", lieuId: "dom-sam" });
    // saisie manuelle sur un jour que la règle voudrait aussi (échange accepté)
    await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-07", responsableId: "alex" });
    await appliquerRegles(depot, "alex", "2026-03", []);
    const id = (await depot.listerCreneaux({ enfantId: "mila" }))[0]!.id;
    await deplacerCreneau(depot, "alex", id, { fin: "12:00" });

    await depot.supprimerRegle("alex", "we-pair");
    await appliquerRegles(depot, "alex", "2026-03", []);
    const restantes = (await depot.listerGardes()).sort((a, b) => a.date.localeCompare(b.date));
    expect(restantes).toEqual([
      { enfantId: "leo", date: "2026-03-07", responsableId: "alex" },
      { enfantId: "leo", date: "2026-03-10", responsableId: "sam" },
    ]);
    expect(await depot.listerPresences()).toEqual([{ enfantId: "leo", date: "2026-03-10", lieuId: "dom-sam" }]);
    expect((await depot.listerCreneaux()).map((c) => c.id)).toEqual([id]);
  });

  it("n'efface pas les gardes générées d'un autre mois", async () => {
    await poser(wePair);
    await appliquerRegles(depot, "alex", "2026-03", []);
    await depot.supprimerRegle("alex", "we-pair");
    await appliquerRegles(depot, "alex", "2026-04", []);
    expect(await depot.listerGardes({ enfantId: "leo" })).toHaveLength(4);
  });

  it("vacances : changement de bloc fusionné en un seul transfert, présences par nuit", async () => {
    await poser(moities);
    await appliquerRegles(depot, "sam", "2026-04", [printemps]);
    const tr = await depot.listerTransferts();
    expect(tr.map((x) => [x.date, x.heure, x.deposeId, x.recupereId])).toEqual([
      ["2026-04-04", "18:00", "sam", "alex"],
      ["2026-04-11", "18:00", "alex", "sam"],
    ]);
    const nuits = await depot.listerPresences({ enfantId: "mila" });
    expect(nuits).toHaveLength(15);
    expect(nuits.find((p) => p.date === "2026-04-10")!.lieuId).toBe("dom-alex");
    expect(nuits.find((p) => p.date === "2026-04-11")!.lieuId).toBe("dom-sam");
    expect(nuits.find((p) => p.date === "2026-04-18")!.lieuId).toBe("dom-sam");
  });
});

describe("créneaux déplaçables", () => {
  it("déplacer conserve la marque, enregistre un écart et survit à la régénération", async () => {
    await poser(wePair);
    await appliquerRegles(depot, "alex", "2026-03", []);
    const id = genererCreneaux([wePair], [], "2026-03").find((c) => c.enfantId === "leo" && c.date === "2026-03-07")!.id;
    const d = await deplacerCreneau(depot, "sam", id, { date: "2026-03-06", debut: "18:00" });
    expect(d.origine).toMatchObject({ type: "regle", regleId: "we-pair" });
    expect(d.origine?.ecart).toContain("2026-03-07 10:00-23:59");
    expect(d.origine?.ecart).toContain("2026-03-06 18:00-23:59");
    expect(d).toMatchObject({ id, date: "2026-03-06", debut: "18:00" });

    const r = await appliquerRegles(depot, "alex", "2026-03", []);
    expect(r.creneauxEcrits).toBe(0);
    expect(r.creneauxPreserves).toBe(1);
    const apres = (await depot.listerCreneaux()).find((c) => c.id === id)!;
    expect(apres).toEqual(d);
    expect((await depot.listerCreneaux()).filter((c) => c.id === id)).toHaveLength(1);
  });

  it("un créneau déplacé n'est pas supprimé comme obsolète, même si la règle disparaît", async () => {
    await poser(wePair);
    await appliquerRegles(depot, "alex", "2026-03", []);
    const id = (await depot.listerCreneaux())[0]!.id;
    await deplacerCreneau(depot, "alex", id, { fin: "12:00" });
    await depot.supprimerRegle("alex", "we-pair");
    await appliquerRegles(depot, "alex", "2026-03", []);
    expect((await depot.listerCreneaux()).map((c) => c.id)).toEqual([id]);
  });

  it("refuse un déplacement invalide ou un créneau inconnu ; un créneau libre ne reçoit pas de marque", async () => {
    await expect(deplacerCreneau(depot, "alex", "absent", { date: "2026-03-01" })).rejects.toThrow(ErreurDomaine);
    const c = await depot.enregistrerCreneau("alex", {
      enfantId: "nina", date: "2026-03-14", debut: "09:00", fin: "10:00", libelle: "Libre",
    });
    await expect(deplacerCreneau(depot, "alex", c.id, { date: "2026-02-30" })).rejects.toThrow(ErreurDomaine);
    await expect(deplacerCreneau(depot, "alex", c.id, { fin: "08:00" })).rejects.toThrow(ErreurDomaine);
    const d = await deplacerCreneau(depot, "alex", c.id, { date: "2026-03-15" });
    expect(d.origine).toBeUndefined();
  });
});

describe("acceptation : un mois entier de planning pour la famille fictive", () => {
  it("mars 2026 avec règles paire, impaire (lieu neutre) et enfant suiveur", async () => {
    await poser(wePair, weImpair, suitSam);
    await appliquerRegles(depot, "alex", "2026-03", []);

    const jours = async (enfantId: string) =>
      (await depot.listerCreneaux({ enfantId, du: "2026-03-01", au: "2026-03-31" })).map((c) => c.date);
    // Léo et Mila : impairs (ven. 27/02, 13/03, 27/03 jusqu'au lundi) et pairs (7-8 et 21-22)
    const attendu = [
      "2026-03-01", "2026-03-02", "2026-03-07", "2026-03-08", "2026-03-13", "2026-03-14", "2026-03-15",
      "2026-03-16", "2026-03-21", "2026-03-22", "2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30",
    ];
    expect(await jours("leo")).toEqual(attendu);
    expect(await jours("mila")).toEqual(attendu);
    expect(await jours("nina")).toEqual(["2026-03-07", "2026-03-08", "2026-03-21", "2026-03-22"]);

    const gardesLeo = Object.fromEntries((await depot.listerGardes({ enfantId: "leo" })).map((g) => [g.date, g.responsableId]));
    expect(gardesLeo["2026-03-01"]).toBe("alex");
    expect(gardesLeo["2026-03-08"]).toBe("sam");
    expect(gardesLeo["2026-03-16"]).toBe("alex");
    expect(gardesLeo["2026-03-10"]).toBeUndefined();

    const nuits = (await depot.listerPresences({ enfantId: "leo" })).map((p) => `${p.date}:${p.lieuId}`);
    expect(nuits).toEqual([
      "2026-03-01:dom-alex", "2026-03-07:dom-sam", "2026-03-13:dom-alex", "2026-03-14:dom-alex",
      "2026-03-15:dom-alex", "2026-03-21:dom-sam", "2026-03-27:dom-alex", "2026-03-28:dom-alex", "2026-03-29:dom-alex",
    ]);

    const transferts = await depot.listerTransferts();
    expect(transferts).toHaveLength(9); // 4 pairs + 5 impairs (02/03, 13/03, 16/03, 27/03, 30/03)
    expect(transferts.filter((x) => x.lieuId === "parc")).toHaveLength(5);
    // idempotent sur le mois entier
    const n = (await depot.lireJournal()).length;
    await appliquerRegles(depot, "sam", "2026-03", []);
    expect((await depot.lireJournal()).length).toBe(n);
  });
});
