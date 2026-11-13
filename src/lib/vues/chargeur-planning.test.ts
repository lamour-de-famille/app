import { describe, expect, it } from "vitest";
import { chargerPlanning, depotDemonstrationMois } from "./chargeur-planning";

describe("chargerPlanning", () => {
  it("affiche un mois de présences fictives et une demande reçue", async () => {
    const depot = await depotDemonstrationMois("2026-11-13");
    const vue = await chargerPlanning(depot, "alex", 2026, 11, "2026-11-13");
    const jours = vue.semaines.flat().filter((c) => c.dansMois);
    expect(jours).toHaveLength(30);
    expect(jours.every((c) => c.reperes.every((r) => r.etat !== null))).toBe(true);
    expect(vue.demandesRecues).toHaveLength(1);
    expect(vue.demandesRecues[0]!.auteur).toBe("Sam");
  });

  it("accepter une demande applique le résultat et la retire de la liste", async () => {
    const depot = await depotDemonstrationMois("2026-11-13");
    const avant = await chargerPlanning(depot, "alex", 2026, 11, "2026-11-19");
    const demande = avant.demandesRecues[0]!;
    await depot.repondreEchange("alex", demande.id, "acceptee");
    const apres = await chargerPlanning(depot, "alex", 2026, 11, "2026-11-19");
    expect(apres.demandesRecues).toHaveLength(0);
    const cellule = apres.semaines.flat().find((c) => c.date === demande.jours[0])!;
    expect(cellule.reperes.find((r) => r.prenom === "Léo")!.libelle).toBe("Léo, chez l'autre adulte");
    expect((await depot.evenementsANotifier("sam")).length).toBeGreaterThan(0);
  });

  it("refuser ne change aucune présence", async () => {
    const depot = await depotDemonstrationMois("2026-11-13");
    const avant = await chargerPlanning(depot, "alex", 2026, 11, "2026-11-13");
    await depot.repondreEchange("alex", avant.demandesRecues[0]!.id, "refusee");
    const apres = await chargerPlanning(depot, "alex", 2026, 11, "2026-11-13");
    expect(apres.semaines).toEqual(avant.semaines);
    expect(apres.demandesRecues).toHaveLength(0);
  });
});
