import { describe, expect, it } from "vitest";
import { ClientGeminiFactice } from "./client-gemini-factice";
import { configurationIADepuisEnv, MODELE_PAR_DEFAUT, SEUILS_PAR_DEFAUT } from "./configuration";
import { clesPeriode, ClientGeminiPlafonne, PlafondAtteint, PlafondIA, StockageUsageIAMemoire } from "./plafond";
import type { DemandeDictee } from "./types";

const grand = { maxRequetesJour: 1000, maxJetonsJour: 1e9, maxRequetesMois: 1000, maxJetonsMois: 1e9, jetonsReservesParAppel: 100 };
const demande = (): DemandeDictee => ({ audio: { octets: new Uint8Array([1]), mimeType: "audio/webm" }, contexteFamilial: "ctx", maintenant: new Date(), adulteId: "alex" });

function monter(seuils: Partial<typeof grand>, horloge: { t: Date }, factice = new ClientGeminiFactice()) {
  const stockage = new StockageUsageIAMemoire();
  const plafond = new PlafondIA(stockage, { ...grand, ...seuils }, () => horloge.t);
  return { stockage, factice, client: new ClientGeminiPlafonne(factice, plafond) };
}

describe("configuration", () => {
  it("défauts et surcharges", () => {
    expect(configurationIADepuisEnv({})).toEqual({ modele: MODELE_PAR_DEFAUT, seuils: SEUILS_PAR_DEFAUT });
    const c = configurationIADepuisEnv({ GEMINI_MODEL: " m-test ", IA_MAX_REQUETES_JOUR: "3", IA_MAX_JETONS_MOIS: "abc", IA_MAX_JETONS_JOUR: "-5" });
    expect(c.modele).toBe("m-test");
    expect(c.seuils.maxRequetesJour).toBe(3);
    expect(c.seuils.maxJetonsMois).toBe(SEUILS_PAR_DEFAUT.maxJetonsMois);
    expect(c.seuils.maxJetonsJour).toBe(SEUILS_PAR_DEFAUT.maxJetonsJour);
  });
});

describe("clesPeriode", () => {
  it("utilise le fuseau Europe/Paris", () => {
    expect(clesPeriode(new Date("2026-11-14T22:59:00Z")).jour).toBe("jour:2026-11-14");
    expect(clesPeriode(new Date("2026-11-14T23:00:00Z")).jour).toBe("jour:2026-11-15");
    expect(clesPeriode(new Date("2026-11-30T23:30:00Z"))).toEqual({ jour: "jour:2026-12-01", mois: "mois:2026-12" });
  });
});

describe("plafond de requêtes", () => {
  it("coupe juste à la limite, sans consommer ni appeler le client", async () => {
    const h = { t: new Date("2026-11-14T10:00:00Z") };
    const { client, factice, stockage } = monter({ maxRequetesJour: 2 }, h);
    await client.traiterDictee(demande());
    await client.rediger({ consigne: "a", contexte: "b" });
    const avant = await stockage.lire("jour:2026-11-14");
    expect(avant.requetes).toBe(2);
    const erreur = await client.traiterDictee(demande()).catch((e) => e);
    expect(erreur).toBeInstanceOf(PlafondAtteint);
    expect(erreur.periode).toBe("jour");
    expect(erreur.message).toMatch(/quotidienne/);
    expect(factice.appelsDictee).toHaveLength(1);
    expect(await stockage.lire("jour:2026-11-14")).toEqual(avant);
    expect(await stockage.lire("mois:2026-11")).toEqual(avant);
  });

  it("remise à zéro au changement de jour", async () => {
    const h = { t: new Date("2026-11-14T10:00:00Z") };
    const { client } = monter({ maxRequetesJour: 1 }, h);
    await client.rediger({ consigne: "a", contexte: "b" });
    await expect(client.rediger({ consigne: "a", contexte: "b" })).rejects.toBeInstanceOf(PlafondAtteint);
    h.t = new Date("2026-11-15T10:00:00Z");
    await expect(client.rediger({ consigne: "a", contexte: "b" })).resolves.toBeDefined();
  });

  it("remise à zéro au changement de mois, avec message mensuel", async () => {
    const h = { t: new Date("2026-11-29T10:00:00Z") };
    const { client } = monter({ maxRequetesMois: 1 }, h);
    await client.rediger({ consigne: "a", contexte: "b" });
    h.t = new Date("2026-11-30T10:00:00Z");
    const e = await client.rediger({ consigne: "a", contexte: "b" }).catch((x) => x);
    expect(e).toBeInstanceOf(PlafondAtteint);
    expect(e.periode).toBe("mois");
    expect(e.message).toMatch(/mensuelle/);
    h.t = new Date("2026-12-01T10:00:00Z");
    await expect(client.rediger({ consigne: "a", contexte: "b" })).resolves.toBeDefined();
  });

  it("un refus mensuel ne laisse rien consommé au jour", async () => {
    const h = { t: new Date("2026-11-14T10:00:00Z") };
    const { client, stockage } = monter({ maxRequetesMois: 1 }, h);
    await client.rediger({ consigne: "a", contexte: "b" });
    await expect(client.rediger({ consigne: "a", contexte: "b" })).rejects.toBeInstanceOf(PlafondAtteint);
    expect((await stockage.lire("jour:2026-11-14")).requetes).toBe(1);
  });
});

describe("plafond de jetons", () => {
  it("enregistre l'usage réel à la place de l'estimation", async () => {
    const h = { t: new Date("2026-11-14T10:00:00Z") };
    const f = new ClientGeminiFactice({ usage: { jetonsEntree: 30, jetonsSortie: 20 } });
    const { client, stockage } = monter({}, h, f);
    await client.rediger({ consigne: "a", contexte: "b" });
    expect(await stockage.lire("jour:2026-11-14")).toEqual({ requetes: 1, jetons: 50 });
    expect(await stockage.lire("mois:2026-11")).toEqual({ requetes: 1, jetons: 50 });
  });

  it("refuse quand l'estimation ferait dépasser le seuil, accepte pile à la limite", async () => {
    const h = { t: new Date("2026-11-14T10:00:00Z") };
    const f = new ClientGeminiFactice({ usage: { jetonsEntree: 60, jetonsSortie: 40 } });
    const { client, stockage } = monter({ maxJetonsJour: 200 }, h, f);
    await client.rediger({ consigne: "a", contexte: "b" }); // 100 utilisés
    await client.rediger({ consigne: "a", contexte: "b" }); // 200 : pile la limite
    await expect(client.rediger({ consigne: "a", contexte: "b" })).rejects.toBeInstanceOf(PlafondAtteint);
    expect((await stockage.lire("jour:2026-11-14")).jetons).toBe(200);
    expect(f.appelsRedaction).toHaveLength(2);
  });

  it("rend la réservation si l'appel échoue", async () => {
    const h = { t: new Date("2026-11-14T10:00:00Z") };
    const { client, stockage } = monter({ maxRequetesJour: 1 }, h, new ClientGeminiFactice({ erreur: new Error("réseau") }));
    await expect(client.traiterDictee(demande())).rejects.toThrow("réseau");
    expect(await stockage.lire("jour:2026-11-14")).toEqual({ requetes: 0, jetons: 0 });
  });
});
