import { beforeEach, describe, expect, it } from "vitest";
import { DepotMemoire } from "./depot-memoire";
import { ErreurDomaine } from "./depot";
import { familleFictive } from "./fixture-famille";
import type { Famille } from "./types";

let t = 0;
const horloge = () => new Date(Date.UTC(2026, 0, 1, 12, 0, t++));
let depot: DepotMemoire;
beforeEach(() => {
  t = 0;
  depot = new DepotMemoire(familleFictive, { maintenant: horloge });
});

const avec = (modif: Partial<Famille>): Famille => ({ ...familleFictive, ...modif });

describe("repondreEchange atomique", () => {
  it("n'écrit rien si le domicile du responsable est introuvable", async () => {
    const d = await depot.proposerEchange("sam", {
      responsableId: "sam",
      enfantIds: ["leo", "mila"],
      jours: ["2026-04-03", "2026-04-04"],
    });
    // Corruption simulée après construction : le calcul doit échouer avant toute écriture.
    (depot as unknown as { famille: Famille }).famille.lieux = [];
    const journalAvant = await depot.lireJournal();
    const evAvant = await depot.evenementsANotifier("sam");
    await expect(depot.repondreEchange("alex", d.id, "acceptee")).rejects.toThrow(ErreurDomaine);
    expect((await depot.listerDemandes())[0]!.statut).toBe("proposee");
    expect(await depot.listerGardes()).toEqual([]);
    expect(await depot.listerPresences()).toEqual([]);
    expect(await depot.lireJournal()).toEqual(journalAvant);
    expect(await depot.evenementsANotifier("sam")).toEqual(evAvant);
  });
});

describe("validation de la famille à la création", () => {
  it("refuse deux adultes de même id", () => {
    const a = familleFictive.adultes[0];
    expect(() => new DepotMemoire(avec({ adultes: [a, { ...a, prenom: "Autre" }] }))).toThrow(/adultes/);
  });

  it("refuse l'absence de domicile_a ou de domicile_b", () => {
    const sansA = familleFictive.lieux.filter((l) => l.type !== "domicile_a");
    const sansB = familleFictive.lieux.filter((l) => l.type !== "domicile_b");
    expect(() => new DepotMemoire(avec({ lieux: sansA }))).toThrow(/domicile_a/);
    expect(() => new DepotMemoire(avec({ lieux: sansB }))).toThrow(/domicile_b/);
  });

  it("refuse des ids de lieux en double", () => {
    const lieux = [...familleFictive.lieux, { id: "parc", type: "autre" as const, libelle: "Doublon" }];
    expect(() => new DepotMemoire(avec({ lieux }))).toThrow(/lieu/i);
  });

  it("refuse des ids d'enfants en double", () => {
    const e = familleFictive.enfants[0]!;
    expect(() => new DepotMemoire(avec({ enfants: [e, { ...e }] }))).toThrow(/enfant/i);
  });

  it("accepte la famille fictive", () => {
    expect(() => new DepotMemoire(familleFictive)).not.toThrow();
  });
});
