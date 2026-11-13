import { describe, expect, it } from "vitest";
import { chargerAujourdhui, depotDemonstration } from "./chargeur";

describe("chargerAujourdhui", () => {
  it("lit le dépôt de démonstration pour un adulte donné", async () => {
    const depot = await depotDemonstration("2026-11-13");
    const vue = await chargerAujourdhui(depot, "alex", "2026-11-13");
    expect(vue.enfants.map((e) => e.etat)).toEqual(["adulte-connecte", "autre-adulte", "tiers"]);
    expect(vue.prochainTransfert).toMatchObject({ date: "2026-11-14", heure: "17:30", depose: "vous" });
    expect(vue.affaires.length).toBeGreaterThan(0);
  });

  it("passe d'un mois à l'autre pour la date du lendemain", async () => {
    const depot = await depotDemonstration("2026-11-30");
    const vue = await chargerAujourdhui(depot, "sam", "2026-11-30");
    expect(vue.prochainTransfert?.date).toBe("2026-12-01");
  });
});
