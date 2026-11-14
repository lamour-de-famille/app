import { describe, expect, it } from "vitest";
import { creerJeton, NOM_COOKIE_SESSION } from "@/lib/auth/session";
import { familleFictive } from "@/lib/domaine/fixture-famille";
import { BanqueMemoire } from "@/lib/firestore/banque-memoire";
import { DepotFirestore } from "@/lib/firestore/depot-firestore";
import { StockageUsageIAFirestore } from "@/lib/firestore/usage-ia-firestore";
import { clesPeriode, PlafondAtteint } from "../ia/plafond";
import { clientGeminiPlafonne, dependancesParDefaut } from "./composition";
import { traiterProposer, traiterValider } from "./routes";
import { DicteeNonConfiguree } from "./types";

const SECRET = "cle-de-test-fictive-0123456789-abcdefghij";
const ENV = {
  NODE_ENV: "production",
  SESSION_SECRET: SECRET,
  FAMILLE_ID: "fam-prod",
  FIRESTORE_PROJECT_ID: "p",
  ADULTES_EMAILS: "alex=alex@exemple.invalid,sam=sam@exemple.invalid",
  ALLOWED_EMAILS: "alex@exemple.invalid,sam@exemple.invalid",
  GEMINI_API_KEY: "cle-gemini-fictive",
};
const cookie = `${NOM_COOKIE_SESSION}=${creerJeton({ email: "alex@exemple.invalid", nom: "X" }, Date.now(), SECRET)}`;

const SORTIE = { transcription: "t", taches: [{ titre: "Courses", assigneId: "sam" }], rendezVous: [], notes: [{ texte: "Pull bleu" }] };
const REPONSE = { candidates: [{ content: { parts: [{ text: JSON.stringify(SORTIE) }] } }], usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100 } };

function fetchEspion() {
  const appels: string[] = [];
  const appeler = (async (url: string) => {
    appels.push(url);
    return new Response(JSON.stringify(REPONSE), { status: 200 });
  }) as unknown as typeof fetch;
  return { appels, appeler };
}

async function monter(env: Record<string, string | undefined> = ENV) {
  const banque = new BanqueMemoire();
  await new DepotFirestore(banque, "fam-prod").initialiserFamille(familleFictive);
  const { appels, appeler } = fetchEspion();
  const d = { ...dependancesParDefaut({ appeler }), env, banque };
  return { banque, appels, d };
}

const proposer = (d: Awaited<ReturnType<typeof monter>>["d"]) =>
  traiterProposer(new Request("https://app.exemple.invalid/api/dictee", { method: "POST", body: new Uint8Array([1, 2, 3]), headers: { "content-type": "audio/webm", cookie } }), d);
const valider = (d: Awaited<ReturnType<typeof monter>>["d"], corps: unknown) =>
  traiterValider(new Request("https://app.exemple.invalid/api/dictee/valider", { method: "POST", body: JSON.stringify(corps), headers: { "content-type": "application/json", cookie } }), d);

describe("composition de production", () => {
  it("sans GEMINI_API_KEY : 503 « Dictée non configurée. », aucun appel, rien d'écrit", async () => {
    for (const cle of [undefined, "", "   "]) {
      const { d, appels, banque } = await monter({ ...ENV, GEMINI_API_KEY: cle });
      const avant = banque.compter();
      const rep = await proposer(d);
      expect(rep.status).toBe(503);
      expect((await rep.json()).erreur).toEqual({ code: "dictee_non_configuree", message: "Dictée non configurée." });
      expect(appels).toEqual([]);
      expect(banque.compter()).toBe(avant);
    }
  });

  it("clientGeminiPlafonne refuse de se construire sans clé : jamais de client non plafonné", () => {
    const usage = new StockageUsageIAFirestore(new BanqueMemoire(), "fam-prod");
    expect(() => clientGeminiPlafonne({}, usage)).toThrow(DicteeNonConfiguree);
  });

  it("dictée puis validation de bout en bout sur Firestore : tâche (id UUID), note, usage compté en base", async () => {
    const { d, banque, appels } = await monter();
    const rep = await proposer(d);
    expect(rep.status).toBe(200);
    const p = await rep.json();
    expect(appels).toHaveLength(1);
    const ok = await valider(d, { propositionId: p.id, retenus: { taches: [0], notes: [0] } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ taches: 1, notes: 1 });

    const taches = await banque.transaction((tx) => tx.lister("familles/fam-prod/taches"));
    expect(taches).toHaveLength(1);
    expect(taches[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await banque.transaction((tx) => tx.lister("familles/fam-prod/notes"))).toHaveLength(1);
    // Usage réel (200 + 100 jetons) enregistré en base, jour et mois.
    const cles = clesPeriode(new Date());
    const usage = new StockageUsageIAFirestore(banque, "fam-prod");
    expect(await usage.lire(cles.jour)).toEqual({ requetes: 1, jetonsEntree: 200, jetonsSortie: 100 });
    expect(await usage.lire(cles.mois)).toEqual({ requetes: 1, jetonsEntree: 200, jetonsSortie: 100 });
    // Usage unique : la proposition est consommée, y compris pour une autre instance du service.
    expect((await valider(d, { propositionId: p.id, retenus: { taches: [0] } })).status).toBe(404);
  });

  it("le plafond est lu en base : il tient d'une requête (donc d'une instance) à l'autre", async () => {
    const { d, appels } = await monter({ ...ENV, IA_MAX_REQUETES_JOUR: "1" });
    expect((await proposer(d)).status).toBe(200);
    const rep = await proposer(d);
    expect(rep.status).toBe(429);
    expect(appels).toHaveLength(1);
  });

  it("le client de rédaction des notifications passe par le même plafond", async () => {
    const banque = new BanqueMemoire();
    const usage = new StockageUsageIAFirestore(banque, "fam-prod");
    const { appels, appeler } = fetchEspion();
    const client = clientGeminiPlafonne({ ...ENV, IA_MAX_REQUETES_JOUR: "2" }, usage, appeler);
    await client.traiterDictee({ audio: { octets: new Uint8Array([1]), mimeType: "audio/webm" }, famille: familleFictive, maintenant: new Date(), adulteId: "alex" });
    await client.rediger({ consigne: "c", contexte: "x" });
    expect((await usage.lire(clesPeriode(new Date()).jour)).requetes).toBe(2);
    await expect(client.rediger({ consigne: "c", contexte: "x" })).rejects.toBeInstanceOf(PlafondAtteint);
    expect(appels).toHaveLength(2);
  });
});
