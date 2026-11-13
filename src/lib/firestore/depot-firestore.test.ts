import { describe, expect, it } from "vitest";
import { ErreurDomaine } from "../domaine/depot";
import { suiteContratDepot } from "../domaine/depot-contrat";
import { familleFictive } from "../domaine/fixture-famille";
import { BanqueMemoire } from "./banque-memoire";
import { DepotFirestore } from "./depot-firestore";

let n = 0;
async function nouveau() {
  const banque = new BanqueMemoire();
  const depot = new DepotFirestore(banque, `fam-${++n}`);
  await depot.initialiserFamille(familleFictive);
  return { banque, depot };
}

describe("DepotFirestore sur banque en mémoire : contrat", () => {
  suiteContratDepot(async (famille, maintenant) => {
    const depot = new DepotFirestore(new BanqueMemoire(), `fam-${++n}`, { maintenant });
    await depot.initialiserFamille(famille);
    return depot;
  });
});

describe("DepotFirestore : spécifique", () => {
  it("partage l'état entre instances et range les documents par famille", async () => {
    const { banque, depot } = await nouveau();
    await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-10", responsableId: "alex" });
    const autre = new DepotFirestore(banque, (await depot.lireFamille()).id);
    expect(await autre.listerGardes()).toHaveLength(1);
    // famille + garde + 1 entrée de journal + 1 événement
    expect(banque.compter()).toBe(4);
  });

  it("conserve toutes les écritures concurrentes", async () => {
    const { banque, depot } = await nouveau();
    const autre = new DepotFirestore(banque, (await depot.lireFamille()).id);
    await Promise.all(
      ["2026-03-10", "2026-03-11", "2026-03-12"].map((date, i) =>
        (i % 2 ? autre : depot).definirGarde("alex", { enfantId: "leo", date, responsableId: "alex" }),
      ),
    );
    expect(await depot.listerGardes()).toHaveLength(3);
    const journal = await depot.lireJournal();
    expect(journal).toHaveLength(3);
    expect(new Set(journal.map((e) => e.id)).size).toBe(3);
  });

  it("une écriture rejetée ne laisse aucun document", async () => {
    const { banque, depot } = await nouveau();
    const avant = banque.compter();
    await expect(
      depot.definirGarde("alex", { enfantId: "inconnu", date: "2026-03-10", responsableId: "alex" }),
    ).rejects.toThrow(ErreurDomaine);
    expect(banque.compter()).toBe(avant);
  });

  it("refuse un id de document impropre (« / ») sans rien écrire", async () => {
    const { banque, depot } = await nouveau();
    const avant = banque.compter();
    await expect(
      depot.enregistrerCreneau("alex", {
        id: "a/b",
        enfantId: "leo",
        date: "2026-03-14",
        debut: "09:00",
        fin: "10:00",
        libelle: "Test",
      }),
    ).rejects.toThrow(ErreurDomaine);
    expect(banque.compter()).toBe(avant);
  });

  it("refuse une famille absente ou invalide", async () => {
    const depot = new DepotFirestore(new BanqueMemoire(), "absente");
    await expect(depot.listerGardes()).rejects.toThrow(/introuvable/);
    const a = familleFictive.adultes[0];
    await expect(depot.initialiserFamille({ ...familleFictive, adultes: [a, a] })).rejects.toThrow(ErreurDomaine);
  });

  it("relit le journal dans l'ordre des écritures", async () => {
    const { depot } = await nouveau();
    const dates = ["2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"];
    for (const date of dates) {
      await depot.definirGarde("alex", { enfantId: "leo", date, responsableId: "alex" });
    }
    expect((await depot.lireJournal()).map((e) => e.cle)).toEqual(dates.map((d) => `leo|${d}`));
  });
});
