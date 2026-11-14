import { describe, expect, it } from "vitest";
import { familleFictive } from "../domaine/fixture-famille";
import { ClientGeminiHttp, usageDepuisMetadonnees } from "./client-gemini-http";
import { ClientGeminiPlafonne, PlafondIA, StockageUsageIAMemoire } from "./plafond";
import { SortieDicteeInvalide } from "./sortie-dictee";
import type { DemandeDictee } from "./types";

const CLE_FICTIVE = "cle-de-test-sans-valeur";
const demande = (): DemandeDictee => ({ audio: { octets: new Uint8Array([1, 2]), mimeType: "audio/webm" }, famille: familleFictive, maintenant: new Date(0), adulteId: "alex" });
const sortie = { transcription: "t", taches: [{ titre: "x", assigneId: "alex" }], rendezVous: [], notes: [] };

interface Appel {
  url: string;
  init: RequestInit;
}

function fetchFactice(statut: number, corps: unknown, appels: Appel[] = []): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    appels.push({ url, init });
    return new Response(JSON.stringify(corps), { status: statut });
  }) as unknown as typeof fetch;
}

const reponse = (texte: string, usageMetadata?: object) => ({ candidates: [{ content: { parts: [{ text: texte }] } }], ...(usageMetadata && { usageMetadata }) });

describe("ClientGeminiHttp (fetch factice)", () => {
  it("exige une clé", () => {
    expect(() => new ClientGeminiHttp("", "m")).toThrow(/GEMINI_API_KEY/);
  });

  it("envoie la clé en en-tête, le modèle dans l'URL, un délai maximal, et lit l'usage", async () => {
    const appels: Appel[] = [];
    const usageMetadata = { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 50, totalTokenCount: 200 };
    const c = new ClientGeminiHttp(CLE_FICTIVE, "modele/test", fetchFactice(200, reponse(JSON.stringify(sortie), usageMetadata), appels));
    const r = await c.traiterDictee(demande());
    expect(r.resultat).toEqual(sortie);
    expect(r.usage).toEqual({ jetonsEntree: 120, jetonsSortie: 80 });
    const [a] = appels;
    expect(a?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/modele%2Ftest:generateContent");
    expect((a?.init.headers as Record<string, string>)["x-goog-api-key"]).toBe(CLE_FICTIVE);
    expect(a?.url).not.toContain(CLE_FICTIVE);
    expect(a?.init.method).toBe("POST");
    expect(a?.init.signal).toBeInstanceOf(AbortSignal);
    expect(String(a?.init.body)).toContain("alex (Alex)".replace("Alex", familleFictive.adultes[0].prenom));
  });

  it("borne la taille de la réponse et la réflexion, pour la dictée comme pour la rédaction", async () => {
    const appels: Appel[] = [];
    const c = new ClientGeminiHttp(CLE_FICTIVE, "m", fetchFactice(200, reponse(JSON.stringify(sortie)), appels));
    await c.traiterDictee(demande());
    await c.rediger({ consigne: "a", contexte: "b" });
    const [dictee, redaction] = appels.map((a) => JSON.parse(String(a.init.body)).generationConfig);
    expect(dictee).toEqual({ responseMimeType: "application/json", maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 1024 } });
    expect(redaction.maxOutputTokens).toBeGreaterThan(0);
    expect(redaction.thinkingConfig.thinkingBudget).toBeGreaterThan(0);
  });

  it("rediger rend le texte et l'usage", async () => {
    const c = new ClientGeminiHttp(CLE_FICTIVE, "m", fetchFactice(200, reponse(" Bonjour ", { promptTokenCount: 5, candidatesTokenCount: 2 })));
    expect(await c.rediger({ consigne: "a", contexte: "b" })).toEqual({ texte: "Bonjour", usage: { jetonsEntree: 5, jetonsSortie: 2 } });
  });

  it("lève une erreur simple sur une réponse non 2xx, sans fuite de la clé", async () => {
    const c = new ClientGeminiHttp(CLE_FICTIVE, "m", fetchFactice(429, { error: "quota" }));
    const e = await c.rediger({ consigne: "a", contexte: "b" }).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(SortieDicteeInvalide);
    expect(e.message).toBe("Gemini a répondu 429.");
  });

  it("sortie invalide : l'erreur porte l'usage réel", async () => {
    const c = new ClientGeminiHttp(CLE_FICTIVE, "m", fetchFactice(200, reponse("pas du json", { promptTokenCount: 10, candidatesTokenCount: 4, thoughtsTokenCount: 6 })));
    const e = await c.traiterDictee(demande()).catch((x) => x);
    expect(e).toBeInstanceOf(SortieDicteeInvalide);
    expect(e.usage).toEqual({ jetonsEntree: 10, jetonsSortie: 10 });
  });

  it("identifiant inconnu dans la sortie : refusé par le client lui-même", async () => {
    const mauvaise = { ...sortie, taches: [{ titre: "x", assigneId: "inconnu" }] };
    const c = new ClientGeminiHttp(CLE_FICTIVE, "m", fetchFactice(200, reponse(JSON.stringify(mauvaise), { promptTokenCount: 1, candidatesTokenCount: 1 })));
    await expect(c.traiterDictee(demande())).rejects.toBeInstanceOf(SortieDicteeInvalide);
  });
});

describe("usageDepuisMetadonnees", () => {
  it("compte la réflexion, ou le total s'il est plus grand ; inconnu si absent", () => {
    expect(usageDepuisMetadonnees({ promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 20 })).toEqual({ jetonsEntree: 10, jetonsSortie: 25 });
    expect(usageDepuisMetadonnees({ promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 60 })).toEqual({ jetonsEntree: 10, jetonsSortie: 50 });
    expect(usageDepuisMetadonnees(undefined)).toBeUndefined();
    expect(usageDepuisMetadonnees({})).toBeUndefined();
  });
});

describe("de bout en bout avec le plafond (fetch factice)", () => {
  const monter = (statut: number, corps: unknown) => {
    const stockage = new StockageUsageIAMemoire();
    const seuils = { maxRequetesJour: 9, maxJetonsEntreeJour: 1e6, maxJetonsSortieJour: 1e6, maxRequetesMois: 9, maxJetonsEntreeMois: 1e6, maxJetonsSortieMois: 1e6, jetonsEntreeReservesParAppel: 500, jetonsSortieReservesParAppel: 400 };
    const plafond = new PlafondIA(stockage, seuils, () => new Date("2026-11-14T10:00:00Z"));
    return { stockage, client: new ClientGeminiPlafonne(new ClientGeminiHttp(CLE_FICTIVE, "m", fetchFactice(statut, corps)), plafond) };
  };

  it("réponse 200 invalide : requête et jetons comptés", async () => {
    const { client, stockage } = monter(200, reponse("{oups", { promptTokenCount: 70, candidatesTokenCount: 10, thoughtsTokenCount: 5 }));
    await expect(client.traiterDictee(demande())).rejects.toBeInstanceOf(SortieDicteeInvalide);
    expect(await stockage.lire("jour:2026-11-14")).toEqual({ requetes: 1, jetonsEntree: 70, jetonsSortie: 15 });
    expect(await stockage.lire("mois:2026-11")).toEqual({ requetes: 1, jetonsEntree: 70, jetonsSortie: 15 });
  });

  it("réponse 200 invalide sans usageMetadata : l'estimation reste comptée", async () => {
    const { client, stockage } = monter(200, reponse("{oups"));
    await expect(client.traiterDictee(demande())).rejects.toBeInstanceOf(SortieDicteeInvalide);
    expect(await stockage.lire("jour:2026-11-14")).toEqual({ requetes: 1, jetonsEntree: 500, jetonsSortie: 400 });
  });

  it("non-2xx : réservation rendue", async () => {
    const { client, stockage } = monter(503, {});
    await expect(client.traiterDictee(demande())).rejects.toThrow(/503/);
    expect(await stockage.lire("jour:2026-11-14")).toEqual({ requetes: 0, jetonsEntree: 0, jetonsSortie: 0 });
  });
});
