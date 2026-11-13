import { describe, expect, it } from "vitest";
import type { EtatSynchro, StockageEtatSynchro } from "../agenda/types";

const etat = (adulteId: string, extra: Partial<EtatSynchro> = {}): EtatSynchro => ({
  adulteId,
  statut: "ok",
  erreurs: [],
  nombreElements: 3,
  crees: 1,
  modifies: 1,
  supprimes: 1,
  ...extra,
});

/** Contrat de `StockageEtatSynchro`, exécuté contre chaque implémentation. */
export function suiteStockageEtat(creer: () => Promise<StockageEtatSynchro>) {
  describe("contrat StockageEtatSynchro", () => {
    it("retourne undefined tant que rien n'est écrit", async () => {
      expect(await (await creer()).lire("alex")).toBeUndefined();
    });

    it("relit ce qui a été écrit, champs facultatifs compris, par adulte", async () => {
      const s = await creer();
      const a = etat("alex", { dernierSucces: "2026-03-10T08:00:00.000Z", derniereTentative: "2026-03-10T08:00:00.000Z" });
      const b = etat("sam", { statut: "erreur", erreurs: ["Agenda indisponible (fictif)"] });
      await s.ecrire(a);
      await s.ecrire(b);
      expect(await s.lire("alex")).toEqual(a);
      expect(await s.lire("sam")).toEqual(b);
    });

    it("remplace l'état précédent", async () => {
      const s = await creer();
      await s.ecrire(etat("alex", { dernierSucces: "2026-03-10T08:00:00.000Z" }));
      await s.ecrire(etat("alex", { statut: "a_reconnecter" }));
      const lu = await s.lire("alex");
      expect(lu?.statut).toBe("a_reconnecter");
      expect(lu?.dernierSucces).toBeUndefined();
    });

    it("isole la valeur retournée", async () => {
      const s = await creer();
      await s.ecrire(etat("alex"));
      (await s.lire("alex"))!.erreurs.push("x");
      expect((await s.lire("alex"))!.erreurs).toEqual([]);
    });
  });
}
