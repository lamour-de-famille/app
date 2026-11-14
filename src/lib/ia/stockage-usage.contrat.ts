import { describe, expect, it } from "vitest";
import type { StockageUsageIA } from "./plafond";

const c = (requetes: number, jetonsEntree: number, jetonsSortie: number) => ({ requetes, jetonsEntree, jetonsSortie });

/** Contrat de `StockageUsageIA`, exécuté contre chaque implémentation. */
export function suiteStockageUsageIA(creer: () => Promise<StockageUsageIA>) {
  describe("contrat StockageUsageIA", () => {
    it("lit zéro tant que rien n'est ajouté", async () => {
      expect(await (await creer()).lire("jour:2026-11-14")).toEqual(c(0, 0, 0));
    });

    it("ajoute, cumule et renvoie le nouveau total", async () => {
      const s = await creer();
      expect(await s.ajouter("jour:2026-11-14", c(1, 5000, 4000))).toEqual(c(1, 5000, 4000));
      expect(await s.ajouter("jour:2026-11-14", c(1, 100, 50))).toEqual(c(2, 5100, 4050));
      expect(await s.lire("jour:2026-11-14")).toEqual(c(2, 5100, 4050));
    });

    it("retranche avec un delta négatif (annulation, ajustement vers l'usage réel)", async () => {
      const s = await creer();
      await s.ajouter("mois:2026-11", c(3, 15000, 12000));
      expect(await s.ajouter("mois:2026-11", c(-1, -4900, -3950))).toEqual(c(2, 10100, 8050));
    });

    it("sépare les clés de période", async () => {
      const s = await creer();
      await s.ajouter("jour:2026-11-14", c(1, 10, 10));
      await s.ajouter("jour:2026-11-15", c(5, 50, 50));
      await s.ajouter("mois:2026-11", c(6, 60, 60));
      expect(await s.lire("jour:2026-11-14")).toEqual(c(1, 10, 10));
      expect(await s.lire("jour:2026-11-15")).toEqual(c(5, 50, 50));
      expect(await s.lire("mois:2026-11")).toEqual(c(6, 60, 60));
    });

    it("incrément ATOMIQUE : des ajouts simultanés ne se perdent pas", async () => {
      const s = await creer();
      const totaux = await Promise.all(Array.from({ length: 25 }, () => s.ajouter("jour:2026-11-14", c(1, 100, 10))));
      expect(await s.lire("jour:2026-11-14")).toEqual(c(25, 2500, 250));
      // Chaque appelant a vu un total distinct : un plafond ne peut donc être franchi sans qu'un appelant le voie.
      expect(new Set(totaux.map((t) => t.requetes)).size).toBe(25);
    });

    it("isole la valeur retournée", async () => {
      const s = await creer();
      const r = await s.ajouter("jour:2026-11-14", c(1, 1, 1));
      r.requetes = 999;
      expect((await s.lire("jour:2026-11-14")).requetes).toBe(1);
    });
  });
}
