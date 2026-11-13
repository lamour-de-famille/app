import { describe, expect, it } from "vitest";
import { dateValide, grilleMois, joursEntre, moisAdjacent, analyserMois } from "./mois";

describe("grilleMois", () => {
  it("novembre 2026 : commence un lundi 26 octobre et finit un dimanche 6 décembre", () => {
    const g = grilleMois(2026, 11);
    expect(g).toHaveLength(6);
    expect(g.every((s) => s.length === 7)).toBe(true);
    expect(g[0]![0]).toEqual({ date: "2026-10-26", jour: 26, dansMois: false });
    expect(g[0]![6]).toEqual({ date: "2026-11-01", jour: 1, dansMois: true });
    expect(g[5]![6]).toEqual({ date: "2026-12-06", jour: 6, dansMois: false });
  });

  it("février 2027 (28 jours, commence un lundi) tient en 4 semaines exactes", () => {
    const g = grilleMois(2027, 2);
    expect(g).toHaveLength(4);
    expect(g[0]![0]!.date).toBe("2027-02-01");
    expect(g[3]![6]!.date).toBe("2027-02-28");
  });

  it("gère les années bissextiles et le passage d'année", () => {
    const fev = grilleMois(2028, 2).flat().filter((c) => c.dansMois);
    expect(fev).toHaveLength(29);
    const jan = grilleMois(2027, 1);
    expect(jan[0]![0]!.date).toBe("2026-12-28");
  });

  it("compte exactement les jours du mois", () => {
    for (let m = 1; m <= 12; m++) {
      const n = grilleMois(2026, m).flat().filter((c) => c.dansMois).length;
      expect(n).toBe(new Date(Date.UTC(2026, m, 0)).getUTCDate());
    }
  });

  it("refuse un mois invalide", () => {
    expect(() => grilleMois(2026, 13)).toThrow();
  });
});

describe("moisAdjacent et analyserMois", () => {
  it("passe d'une année à l'autre", () => {
    expect(moisAdjacent(2026, 12, 1)).toEqual({ annee: 2027, mois: 1 });
    expect(moisAdjacent(2026, 1, -1)).toEqual({ annee: 2025, mois: 12 });
    expect(moisAdjacent(2026, 5, 1)).toEqual({ annee: 2026, mois: 6 });
  });
  it("lit AAAA-MM et retombe sur le repli si invalide", () => {
    expect(analyserMois("2026-11", "2026-01")).toEqual({ annee: 2026, mois: 11 });
    expect(analyserMois("n'importe quoi", "2026-01")).toEqual({ annee: 2026, mois: 1 });
    expect(analyserMois(undefined, "2026-01")).toEqual({ annee: 2026, mois: 1 });
    expect(analyserMois("2026-13", "2026-01")).toEqual({ annee: 2026, mois: 1 });
  });
});

describe("joursEntre", () => {
  it("liste les jours, bornes incluses", () => {
    expect(joursEntre("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(joursEntre("2026-11-13", "2026-11-13")).toEqual(["2026-11-13"]);
  });
  it("refuse les dates impossibles", () => {
    expect(() => joursEntre("2026-02-31", "2026-03-02")).toThrow("Dates invalides");
    expect(() => joursEntre("2026-03-01", "2026-04-31")).toThrow("Dates invalides");
    expect(() => joursEntre("2026-13-01", "2026-13-02")).toThrow("Dates invalides");
  });
  it("refuse une plage inversée, invalide ou trop longue", () => {
    expect(() => joursEntre("2026-11-14", "2026-11-13")).toThrow();
    expect(() => joursEntre("hier", "2026-11-13")).toThrow();
    expect(() => joursEntre("2026-01-01", "2026-06-01")).toThrow();
  });
});

describe("dateValide", () => {
  it("accepte une date réelle et refuse les dates impossibles", () => {
    expect(dateValide("2026-11-30")).toBe(true);
    expect(dateValide("2026-11-31")).toBe(false);
    expect(dateValide("2026-11-99")).toBe(false);
    expect(dateValide("2026-11-00")).toBe(false);
    expect(dateValide("n'importe quoi")).toBe(false);
  });
});
