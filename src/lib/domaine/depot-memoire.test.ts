import { describe, expect, it } from "vitest";
import { DepotMemoire } from "./depot-memoire";
import { ErreurDomaine } from "./depot";
import { familleFictive } from "./fixture-famille";
import { suiteContratDepot } from "./depot-contrat";

describe("DepotMemoire : contrat", () => {
  suiteContratDepot(async (famille, maintenant) => new DepotMemoire(famille, { maintenant }));
});

describe("DepotMemoire : spécifique", () => {
  it("rejette une couleur non hexadécimale", () => {
    const mauvaise = { ...familleFictive, enfants: [{ id: "x", prenom: "X", couleur: "rouge" }] };
    expect(() => new DepotMemoire(mauvaise)).toThrow(ErreurDomaine);
  });

  it("la fixture contient Alex, Sam, Léo, Mila et Nina", () => {
    expect(familleFictive.adultes.map((a) => a.prenom)).toEqual(["Alex", "Sam"]);
    expect(familleFictive.enfants.map((e) => e.prenom)).toEqual(["Léo", "Mila", "Nina"]);
  });
});
