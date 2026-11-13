import { describe, expect, it } from "vitest";
import { basculer, charger, enregistrer, memoireVolatile, type StockageCle } from "./affaires";

describe("état des affaires cochées", () => {
  it("bascule une case dans les deux sens sans muter l'état", () => {
    const vide = {};
    const coche = basculer(vide, "a");
    expect(coche).toEqual({ a: true });
    expect(vide).toEqual({});
    expect(basculer(coche, "a")).toEqual({});
  });

  it("conserve l'état entre deux lectures", () => {
    const s = memoireVolatile();
    enregistrer(s, "alex", { a: true });
    expect(charger(s, "alex")).toEqual({ a: true });
    expect(charger(s, "sam")).toEqual({});
  });

  it("tolère un contenu corrompu ou un stockage qui échoue", () => {
    const s = memoireVolatile();
    s.setItem("affaires:alex", "{pas du json");
    expect(charger(s, "alex")).toEqual({});
    s.setItem("affaires:alex", '{"a":"oui","b":true}');
    expect(charger(s, "alex")).toEqual({ b: true });
    const casse: StockageCle = {
      getItem: () => {
        throw new Error("refusé");
      },
      setItem: () => {
        throw new Error("refusé");
      },
    };
    expect(charger(casse, "alex")).toEqual({});
    expect(() => enregistrer(casse, "alex", { a: true })).not.toThrow();
  });
});
