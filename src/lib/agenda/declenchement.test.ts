import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { familleFictive } from "../domaine/fixture-famille";
import { DepotMemoire } from "../domaine/depot-memoire";
import { AgendaFactice } from "./agenda-factice";
import { declencherSynchroAgenda, synchroApresModification } from "./declenchement";
import { traiterSynchro, secretValide } from "./acces-synchro";
import { StockageEtatMemoire, type ClientAgenda } from "./types";
import { creerJeton } from "../auth/session";

const CLE = "x".repeat(40);
const SECRET = "secret-de-test-synchro";

async function depotAvecNuit() {
  const depot = new DepotMemoire(familleFictive, { maintenant: () => new Date("2026-11-14T10:00:00Z") });
  await depot.definirPresence("alex", { enfantId: "leo", date: "2026-11-20", lieuId: "dom-alex" });
  return depot;
}

describe("declencherSynchroAgenda", () => {
  it("lit le dépôt et synchronise chaque adulte avec son propre client", async () => {
    const depot = await depotAvecNuit();
    const alex = new AgendaFactice();
    const sam = new AgendaFactice();
    const stockage = new StockageEtatMemoire();
    const etats = await declencherSynchroAgenda({ depot, clients: async () => ({ alex, sam }), stockage });
    expect(etats.alex!.statut).toBe("ok");
    expect(alex.contenu("primary")).toHaveLength(1);
    expect(sam.contenu("primary")).toHaveLength(1);
    // idempotent
    const again = await declencherSynchroAgenda({ depot, clients: async () => ({ alex, sam }), stockage });
    expect(again.alex).toMatchObject({ crees: 0, modifies: 0, supprimes: 0 });
  });

  it("sans jeton : état a_reconnecter, aucun appel", async () => {
    const stockage = new StockageEtatMemoire();
    const etats = await declencherSynchroAgenda({ depot: await depotAvecNuit(), clients: async () => ({}), stockage });
    expect(etats.alex!.statut).toBe("a_reconnecter");
    expect((await stockage.lire("sam"))!.statut).toBe("a_reconnecter");
  });

  it("regroupe les demandes pendant une exécution en une seule relance", async () => {
    const depot = await depotAvecNuit();
    const stockage = new StockageEtatMemoire();
    const agenda = new AgendaFactice();
    let ouvrir!: () => void;
    const porte = new Promise<void>((r) => (ouvrir = r));
    let fabriques = 0;
    const clients = async () => {
      fabriques++;
      if (fabriques === 1) await porte;
      return { alex: agenda as ClientAgenda };
    };
    const p1 = declencherSynchroAgenda({ depot, clients, stockage });
    const p2 = declencherSynchroAgenda({ depot, clients, stockage });
    const p3 = declencherSynchroAgenda({ depot, clients, stockage });
    ouvrir();
    await Promise.all([p1, p2, p3]);
    expect(fabriques).toBe(2); // une exécution + une seule relance
  });

  it("libère le verrou après une erreur", async () => {
    const depot = await depotAvecNuit();
    const stockage = new StockageEtatMemoire();
    await expect(
      declencherSynchroAgenda({ depot, clients: async () => Promise.reject(new Error("boum")), stockage }),
    ).rejects.toThrow();
    const etats = await declencherSynchroAgenda({ depot, clients: async () => ({}), stockage });
    expect(etats.alex!.statut).toBe("a_reconnecter");
  });
});

describe("synchroApresModification", () => {
  afterEach(() => vi.restoreAllMocks());
  it("avale l'erreur et journalise sans donnée sensible", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      synchroApresModification({
        depot: async () => {
          throw new Error("alex@exemple.invalid jeton-secret");
        },
        clients: async () => ({}),
        stockage: new StockageEtatMemoire(),
      }),
    ).resolves.toBeUndefined();
    const journal = JSON.stringify(err.mock.calls);
    expect(journal).not.toContain("exemple.invalid");
    expect(journal).not.toContain("jeton-secret");
    expect(err).toHaveBeenCalled();
  });
  it("synchronise quand tout va bien", async () => {
    const depot = await depotAvecNuit();
    const alex = new AgendaFactice();
    await synchroApresModification({ depot: async () => depot, clients: async () => ({ alex }), stockage: new StockageEtatMemoire() });
    expect(alex.contenu("primary")).toHaveLength(1);
  });
});

describe("secretValide", () => {
  it("compare sans accepter le vide ni une valeur différente", () => {
    expect(secretValide(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(secretValide(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(secretValide("Bearer ", "")).toBe(false);
    expect(secretValide("Bearer", "")).toBe(false);
    expect(secretValide(null, SECRET)).toBe(false);
    expect(secretValide(SECRET, SECRET)).toBe(false); // schéma Bearer obligatoire
  });
});

describe("POST /api/synchro/agenda (traiterSynchro)", () => {
  beforeEach(() => vi.stubEnv("SESSION_SECRET", CLE));
  afterEach(() => vi.unstubAllEnvs());

  const liste = ["alex@exemple.invalid"];
  const requete = (h: Record<string, string> = {}) => new Request("http://x.invalid/api/synchro/agenda", { method: "POST", headers: h });
  const deps = async (secret: string | undefined = SECRET) => ({
    secret,
    liste,
    depot: async () => await depotAvecNuit(),
    clients: async () => ({}),
    stockage: new StockageEtatMemoire(),
  });

  it("401 sans identifiants, sans fuite du secret", async () => {
    const r = await traiterSynchro(requete(), await deps());
    expect(r.status).toBe(401);
    expect(await r.text()).not.toContain(SECRET);
  });
  it("401 avec un mauvais secret", async () => {
    expect((await traiterSynchro(requete({ authorization: "Bearer faux" }), await deps())).status).toBe(401);
  });
  it("401 si SYNCHRO_SECRET est vide, même avec un en-tête vide", async () => {
    expect((await traiterSynchro(requete({ authorization: "Bearer " }), await deps(""))).status).toBe(401);
    expect((await traiterSynchro(requete({ authorization: "Bearer " }), await deps(undefined))).status).toBe(401);
  });
  it("200 avec le bon secret", async () => {
    const r = await traiterSynchro(requete({ authorization: `Bearer ${SECRET}` }), await deps());
    expect(r.status).toBe(200);
    const corps = await r.text();
    expect(corps).not.toContain(SECRET);
    expect(JSON.parse(corps).adultes.alex.statut).toBe("a_reconnecter");
  });
  it("200 avec une session d'adulte autorisé", async () => {
    const jeton = creerJeton({ email: "alex@exemple.invalid", nom: "Alex" });
    const r = await traiterSynchro(requete({ cookie: `__Host-session=${jeton}` }), await deps(""));
    expect(r.status).toBe(200);
  });
  it("403 pour une session valide mais non autorisée", async () => {
    const jeton = creerJeton({ email: "leo@exemple.invalid", nom: "Léo" });
    expect((await traiterSynchro(requete({ cookie: `__Host-session=${jeton}` }), await deps())).status).toBe(403);
  });
  it("401 pour une session falsifiée", async () => {
    expect((await traiterSynchro(requete({ cookie: "__Host-session=abc.def" }), await deps())).status).toBe(401);
  });
});
