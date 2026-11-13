import { describe, expect, it, vi } from "vitest";
import { ClientVacancesDoublure, ClientVacancesHttp, critereDepuisEnv, importerVacances, jourDeParis, normaliser, periodesVacances } from "./index";
import { construireUrl } from "./client-http";
import { ErreurVacances } from "./types";

const doublure = new ClientVacancesDoublure();

describe("jourDeParis", () => {
  it("convertit un instant UTC en jour civil de Paris (hiver et été)", () => {
    expect(jourDeParis("2026-12-18T23:00:00+00:00")).toBe("2026-12-19");
    expect(jourDeParis("2027-07-01T22:00:00Z")).toBe("2027-07-02");
  });
  it("accepte un décalage explicite et un jour seul", () => {
    expect(jourDeParis("2026-12-19T00:00:00+01:00")).toBe("2026-12-19");
    expect(jourDeParis("2027-07-02")).toBe("2027-07-02");
  });
  it("refuse les formats invalides", () => {
    for (const v of ["", "demain", "2026-13-40", "2026-02-30", "2026-12-18T23:00:00", 42, null, undefined]) expect(jourDeParis(v)).toBeNull();
  });
});

describe("normaliser", () => {
  it("ignore enregistrements invalides, enseignants, fin avant début", () => {
    expect(normaliser({})).toBeNull();
    expect(normaliser({ description: "x", zones: "Zone A", annee_scolaire: "2026-2027", start_date: "2027-01-02", end_date: "2027-01-01" })).toBeNull();
    expect(normaliser({ description: "x", population: "Enseignants", zones: "Zone A", annee_scolaire: "2026-2027", start_date: "2027-01-01", end_date: "2027-01-02" })).toBeNull();
  });
});

describe("importerVacances", () => {
  it("filtre par zone, trie, dédoublonne et ignore l'invalide", async () => {
    const r = await importerVacances(doublure, { zone: "zone a", anneeScolaire: "2026-2027" });
    expect(r.map((p) => [p.nom, p.debut, p.fin])).toEqual([
      ["Vacances de la Toussaint", "2026-10-17", "2026-11-02"],
      ["Vacances de Noël", "2026-12-19", "2027-01-04"],
      ["Vacances d'Été", "2027-07-02", "2027-08-31"],
    ]);
    expect(r[0]).toEqual({ nom: "Vacances de la Toussaint", debut: "2026-10-17", fin: "2026-11-02", zone: "Zone A", anneeScolaire: "2026-2027" });
  });
  it("filtre par académie sans tenir compte de la casse", async () => {
    const r = await importerVacances(doublure, { academie: "PARIS" });
    expect(r.map((p) => p.zone)).toEqual(["Zone C", "Zone C"]);
  });
  it("filtre par année scolaire", async () => {
    expect(await importerVacances(doublure, { anneeScolaire: "2025-2026" })).toHaveLength(1);
  });
  it("sans critère, tout est gardé et trié", () => {
    const r = periodesVacances(doublure.donnees);
    expect(r).toHaveLength(6);
    expect(r.map((p) => p.debut)).toEqual([...r.map((p) => p.debut)].sort());
  });
});

describe("erreurs réseau", () => {
  it("la doublure en échec lève ErreurVacances", async () => {
    await expect(importerVacances(new ClientVacancesDoublure([], true), {})).rejects.toBeInstanceOf(ErreurVacances);
  });
  it("le client HTTP encapsule échec réseau, HTTP non-2xx et réponse inattendue (fetch simulé)", async () => {
    const base = "https://exemple.invalide/r";
    const reseau = new ClientVacancesHttp(vi.fn().mockRejectedValue(new TypeError("réseau coupé")) as never, base);
    await expect(reseau.recuperer({})).rejects.toBeInstanceOf(ErreurVacances);
    const http500 = new ClientVacancesHttp(vi.fn().mockResolvedValue({ ok: false, status: 500 }) as never, base);
    await expect(http500.recuperer({})).rejects.toThrow(/HTTP 500/);
    const bizarre = new ClientVacancesHttp(vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as never, base);
    await expect(bizarre.recuperer({})).rejects.toThrow(/inattendue/);
  });
  it("le client HTTP lit les résultats (fetch simulé)", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{ description: "a" }] }) });
    expect(await new ClientVacancesHttp(f as never, "https://exemple.invalide/r").recuperer({})).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("configuration et URL", () => {
  it("lit l'environnement, vide = pas de filtre", () => {
    expect(critereDepuisEnv({ VACANCES_ZONE: " Zone B ", VACANCES_ACADEMIE: "" })).toEqual({ zone: "Zone B", academie: undefined, anneeScolaire: undefined });
  });
  it("construit la clause where et le décalage", () => {
    const u = new URL(construireUrl({ academie: "Lyon", zone: "Zone A" }, 100, "https://exemple.invalide/r"));
    expect(u.searchParams.get("where")).toBe('zones="Zone A" and location="Lyon"');
    expect(u.searchParams.get("offset")).toBe("100");
  });
  it("rejette guillemet et antislash dans les filtres", () => {
    for (const v of ['Li"on', "Ly\\on"]) {
      expect(() => construireUrl({ academie: v }, 0, "https://exemple.invalide/r")).toThrow(ErreurVacances);
    }
  });
  it("le client HTTP propage le rejet de configuration sans appeler le réseau", async () => {
    const f = vi.fn();
    await expect(new ClientVacancesHttp(f as never, "https://exemple.invalide/r").recuperer({ zone: 'A"' })).rejects.toThrow(/Configuration/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("pagination du client HTTP (fetch simulé)", () => {
  const base = "https://exemple.invalide/r";
  const page = (n: number, total?: number) => ({ ok: true, json: async () => ({ results: Array.from({ length: n }, () => ({})), total_count: total }) });
  const decalages = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => new URL(c[0] as string).searchParams.get("offset"));

  it("enchaîne les pages et s'arrête sur une page incomplète", async () => {
    const f = vi.fn().mockResolvedValueOnce(page(100)).mockResolvedValueOnce(page(100)).mockResolvedValueOnce(page(30));
    expect(await new ClientVacancesHttp(f as never, base).recuperer({})).toHaveLength(230);
    expect(decalages(f)).toEqual(["0", "100", "200"]);
  });
  it("s'arrête dès que total_count est atteint", async () => {
    const f = vi.fn().mockResolvedValueOnce(page(100, 200)).mockResolvedValueOnce(page(100, 200));
    expect(await new ClientVacancesHttp(f as never, base).recuperer({})).toHaveLength(200);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("lève une erreur si la limite de pages est atteinte avec des résultats restants", async () => {
    const f = vi.fn().mockResolvedValue(page(100, 5000));
    await expect(new ClientVacancesHttp(f as never, base).recuperer({})).rejects.toThrow(/tronqués/);
    expect(f).toHaveBeenCalledTimes(20);
    expect(Math.max(...decalages(f).map(Number)) + 100).toBeLessThanOrEqual(10_000);
  });
});
