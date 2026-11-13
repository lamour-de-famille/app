import { describe, expect, it } from "vitest";
import { periodesPourMoteur } from "./conversion";

describe("periodesPourMoteur", () => {
  it("ramène la date de reprise publiée au dernier jour inclus, sans toucher au reste", () => {
    expect(
      periodesPourMoteur([{ nom: "Vacances de Noël", debut: "2026-12-19", fin: "2027-01-04", zone: "Zone A", anneeScolaire: "2026-2027" }]),
    ).toEqual([{ nom: "Vacances de Noël", debut: "2026-12-19", fin: "2027-01-03", zone: "Zone A" }]);
  });
  it("gère les changements de mois et les années bissextiles", () => {
    const [p] = periodesPourMoteur([{ nom: "x", debut: "2028-02-20", fin: "2028-03-01", zone: "Zone A", anneeScolaire: "2027-2028" }]);
    expect(p!.fin).toBe("2028-02-29");
  });
  it("écarte une période vide après conversion", () => {
    expect(periodesPourMoteur([{ nom: "x", debut: "2026-12-19", fin: "2026-12-19", zone: "Zone A", anneeScolaire: "2026-2027" }])).toEqual([]);
  });
});
