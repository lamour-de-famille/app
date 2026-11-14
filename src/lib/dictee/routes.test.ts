import { describe, expect, it } from "vitest";
import { creerJeton, NOM_COOKIE_SESSION } from "@/lib/auth/session";
import { familleFictive } from "@/lib/domaine/fixture-famille";
import type { Banque, OptionsTransaction, TransactionBanque } from "@/lib/firestore/banque";
import { BanqueMemoire } from "@/lib/firestore/banque-memoire";
import { DepotFirestore } from "@/lib/firestore/depot-firestore";
import { ClientGeminiFactice } from "../ia/client-gemini-factice";
import { SEUILS_PAR_DEFAUT } from "../ia/configuration";
import { ClientGeminiPlafonne, PlafondIA, StockageUsageIAMemoire } from "../ia/plafond";
import type { SortieDictee } from "../ia/types";
import { DepotTachesMemoire } from "../taches";
import { NotesFamilleMemoire } from "./notes";
import { lireCorpsBorne, traiterProposer, traiterValider, type DependancesRoutes } from "./routes";
import { DicteeService } from "./service";
import { StockagePropositionsMemoire } from "./stockage-propositions";

const CLE = "cle-de-test-fictive-0123456789-abcdefghij";
const ENV = {
  NODE_ENV: "production",
  SESSION_SECRET: CLE,
  FAMILLE_ID: "fam-1",
  FIRESTORE_PROJECT_ID: "p",
  ADULTES_EMAILS: "alex=alex@exemple.invalid,sam=sam@exemple.invalid",
  ALLOWED_EMAILS: "alex@exemple.invalid,sam@exemple.invalid",
  IA_MAX_OCTETS_AUDIO: "10",
};
const SORTIE: SortieDictee = {
  transcription: "t",
  taches: [{ titre: "Courses", assigneId: "sam" }],
  rendezVous: [{ titre: "Dentiste", debut: "2026-11-18T16:30", enfantIds: ["mila"] }],
  notes: [],
};
const cookie = (email: string) => `${NOM_COOKIE_SESSION}=${creerJeton({ email, nom: "X" }, Date.now(), CLE)}`;

async function monter(options: { maxRequetes?: number } = {}) {
  const mem = new BanqueMemoire();
  await new DepotFirestore(mem, "fam-1").initialiserFamille(familleFictive);
  const compte = { acces: 0, services: 0 };
  const banque: Banque = {
    transaction<T>(t: (tx: TransactionBanque) => Promise<T>, o?: OptionsTransaction) {
      compte.acces++;
      return mem.transaction(t, o);
    },
  };
  const propositions = new StockagePropositionsMemoire();
  const notes = new NotesFamilleMemoire();
  const usage = new StockageUsageIAMemoire();
  const taches = new DepotTachesMemoire(familleFictive);
  const notifs: unknown[] = [];
  const d: DependancesRoutes = {
    env: ENV,
    banque,
    async service({ depot }) {
      compte.services++;
      const plafond = new PlafondIA(usage, { ...SEUILS_PAR_DEFAUT, maxRequetesJour: options.maxRequetes ?? 30 });
      return new DicteeService({
        depotFamille: depot,
        depotTaches: taches,
        notes,
        propositions,
        gemini: new ClientGeminiPlafonne(new ClientGeminiFactice({ sortie: SORTIE }), plafond),
        notifications: { notifier: async (n) => (notifs.push(n), { statut: "envoyee", texte: "", source: "repli", appareils: 1 }) },
        maxOctetsAudio: 10,
      });
    },
  };
  return { d, compte, taches, notifs };
}

const proposer = (d: DependancesRoutes, email: string | null, corps: BodyInit = new Uint8Array([1, 2, 3]), extra: Record<string, string> = {}) =>
  traiterProposer(
    new Request("https://app.exemple.invalid/api/dictee", { method: "POST", body: corps, headers: { "content-type": "audio/webm", ...(email && { cookie: cookie(email) }), ...extra } }),
    d,
  );
const valider = (d: DependancesRoutes, email: string | null, corps: unknown) =>
  traiterValider(
    new Request("https://app.exemple.invalid/api/dictee/valider", { method: "POST", body: typeof corps === "string" ? corps : JSON.stringify(corps), headers: { "content-type": "application/json", ...(email && { cookie: cookie(email) }) } }),
    d,
  );

describe("garde de session", () => {
  it("sans session : 401, ni base lue ni service construit ni Gemini appelé (proposer et valider)", async () => {
    const { d, compte } = await monter();
    const r1 = await proposer(d, null);
    const r2 = await valider(d, null, { propositionId: "x", retenus: {} });
    expect([r1.status, r2.status]).toEqual([401, 401]);
    expect(compte).toEqual({ acces: 0, services: 0 });
  });

  it("e-mail non autorisé : 401 sans lecture en base", async () => {
    const { d, compte } = await monter();
    expect((await proposer(d, "intrus@exemple.invalid")).status).toBe(401);
    expect(compte.acces).toBe(0);
  });

  it("requête d'une autre origine : 403", async () => {
    const { d, compte } = await monter();
    expect((await proposer(d, "alex@exemple.invalid", undefined, { origin: "https://autre.exemple.invalid" })).status).toBe(403);
    expect(compte.acces).toBe(0);
  });
});

describe("POST /api/dictee puis /api/dictee/valider", () => {
  it("propose sans écrire, puis valide par l'auteur de la session ; l'auteur ne vient jamais du corps", async () => {
    const { d, taches, notifs } = await monter();
    const rep = await proposer(d, "alex@exemple.invalid");
    expect(rep.status).toBe(200);
    const p = await rep.json();
    expect(p.taches).toHaveLength(1);
    expect(await taches.lister()).toEqual([]);

    // Sam ne peut pas valider la proposition d'Alex, même en la connaissant.
    const refus = await valider(d, "sam@exemple.invalid", { propositionId: p.id, auteurId: "alex", retenus: { taches: [0] } });
    expect(refus.status).toBe(404);
    expect(await taches.lister()).toEqual([]);

    const ok = await valider(d, "alex@exemple.invalid", { propositionId: p.id, retenus: { taches: [0], rendezVous: [0] } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ taches: 1, creneaux: 1, notifie: true });
    expect(notifs).toEqual([{ destinataireId: "sam", sujet: "Alex vous a confié une tâche." }]);
    expect(await taches.lister()).toHaveLength(1);

    expect((await valider(d, "alex@exemple.invalid", { propositionId: p.id, retenus: { taches: [0] } })).status).toBe(404);
    expect(await taches.lister()).toHaveLength(1);
  });

  it("plafond IA atteint : 429 avec un message français", async () => {
    const { d, taches } = await monter({ maxRequetes: 1 });
    expect((await proposer(d, "alex@exemple.invalid")).status).toBe(200);
    const rep = await proposer(d, "alex@exemple.invalid");
    expect(rep.status).toBe(429);
    const corps = await rep.json();
    expect(corps.erreur.code).toBe("plafond_atteint");
    expect(corps.erreur.message).toMatch(/Limite quotidienne/);
    expect(await taches.lister()).toEqual([]);
  });

  it("audio trop gros : 413, annoncé ou non, sans appel à Gemini", async () => {
    const { d, compte } = await monter();
    const gros = new Uint8Array(11);
    expect((await proposer(d, "alex@exemple.invalid", gros)).status).toBe(413);
    expect((await proposer(d, "alex@exemple.invalid", new Uint8Array(3), { "content-length": "999999" })).status).toBe(413);
    expect(compte.services).toBe(0);
  });

  it("audio vide : 400", async () => {
    const { d } = await monter();
    const rep = await proposer(d, "alex@exemple.invalid", new Uint8Array());
    expect(rep.status).toBe(400);
    expect((await rep.json()).erreur.code).toBe("audio_vide");
  });

  it("corps de validation illisible ou mal formé : 400 ; choix invalide : 400 sans écriture", async () => {
    const { d, taches } = await monter();
    expect((await valider(d, "alex@exemple.invalid", "{pas du json")).status).toBe(400);
    expect((await valider(d, "alex@exemple.invalid", { propositionId: 3, retenus: {} })).status).toBe(400);
    const p = await (await proposer(d, "alex@exemple.invalid")).json();
    expect((await valider(d, "alex@exemple.invalid", { propositionId: p.id, retenus: { taches: [{ titre: "x", assigneId: "intrus" }] } })).status).toBe(400);
    expect(await taches.lister()).toEqual([]);
  });

  it("non configuré : 503, sans détail interne", async () => {
    const { d } = await monter();
    const rep = await proposer({ ...d, env: { ...ENV, FAMILLE_ID: "" } }, "alex@exemple.invalid");
    expect(rep.status).toBe(503);
    expect(JSON.stringify(await rep.json())).not.toContain("FAMILLE_ID");
  });
});

describe("lireCorpsBorne", () => {
  it("rend les octets sous la limite et null au-delà", async () => {
    const req = (n: number) => new Request("https://x.invalid/", { method: "POST", body: new Uint8Array(n) });
    expect((await lireCorpsBorne(req(5), 5))?.byteLength).toBe(5);
    expect(await lireCorpsBorne(req(6), 5)).toBeNull();
  });
});
