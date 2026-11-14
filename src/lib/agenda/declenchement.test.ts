import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { familleFictive } from "../domaine/fixture-famille";
import { DepotMemoire } from "../domaine/depot-memoire";
import { AgendaFactice } from "./agenda-factice";
import { declencherSynchroAgenda, synchroApresModification } from "./declenchement";
import { traiterSynchro, secretValide } from "./acces-synchro";
import { StockageEtatMemoire, type ClientAgenda } from "./types";
import { NOM_COOKIE_SESSION, creerJeton } from "../auth/session";
import { BanqueMemoire } from "../firestore/banque-memoire";
import { DepotFirestore } from "../firestore/depot-firestore";
import { StockageEtatFirestore } from "../firestore/etat-synchro-firestore";
import { ErreurNonConfigure, banqueUnique, reinitialiserBanqueUnique } from "../acces/depot";
import { dependancesParDefaut, jourParis } from "./service-synchro";

const CLE = "x".repeat(40);
const SECRET = "secret-de-test-synchro-" + "s".repeat(16);

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

  it("sans jeton : état a_reconnecter, aucun appel à l'agenda", async () => {
    const appels = (["lister", "creer", "mettreAJour", "supprimer"] as const).map((m) => vi.spyOn(AgendaFactice.prototype, m));
    const stockage = new StockageEtatMemoire();
    const etats = await declencherSynchroAgenda({ depot: await depotAvecNuit(), clients: async () => ({}), stockage });
    expect(etats.alex!.statut).toBe("a_reconnecter");
    expect((await stockage.lire("sam"))!.statut).toBe("a_reconnecter");
    for (const a of appels) expect(a).not.toHaveBeenCalled();
    vi.restoreAllMocks();
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

  it("la relance utilise les paramètres les plus récents", async () => {
    const depot = await depotAvecNuit();
    const stockage = new StockageEtatMemoire();
    const ancien = new AgendaFactice();
    const recent = new AgendaFactice();
    let ouvrir!: () => void;
    const porte = new Promise<void>((r) => (ouvrir = r));
    const p1 = declencherSynchroAgenda({
      depot,
      clients: async () => {
        await porte;
        return {};
      },
      stockage,
    });
    const p2 = declencherSynchroAgenda({ depot, clients: async () => ({ alex: ancien as ClientAgenda }), stockage });
    const p3 = declencherSynchroAgenda({ depot, clients: async () => ({ alex: recent as ClientAgenda }), stockage });
    ouvrir();
    await Promise.all([p1, p2, p3]);
    expect(recent.contenu("primary")).toHaveLength(1);
    expect(ancien.contenu("primary")).toHaveLength(0);
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
    const court = "c".repeat(31);
    expect(secretValide(`Bearer ${court}`, court)).toBe(false); // secret attendu trop court
    expect(secretValide(`Bearer ${"c".repeat(32)}`, "c".repeat(32))).toBe(true);
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
  it("401 avec un en-tête Authorization invalide, même avec une session valide", async () => {
    const jeton = creerJeton({ email: "alex@exemple.invalid", nom: "Alex" });
    const r = await traiterSynchro(requete({ authorization: "Bearer faux", cookie: `${NOM_COOKIE_SESSION}=${jeton}` }), await deps());
    expect(r.status).toBe(401);
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
    const r = await traiterSynchro(requete({ cookie: `${NOM_COOKIE_SESSION}=${jeton}` }), await deps(""));
    expect(r.status).toBe(200);
  });
  it("403 pour une session valide mais non autorisée", async () => {
    const jeton = creerJeton({ email: "leo@exemple.invalid", nom: "Léo" });
    expect((await traiterSynchro(requete({ cookie: `${NOM_COOKIE_SESSION}=${jeton}` }), await deps())).status).toBe(403);
  });
  it("401 pour une session falsifiée", async () => {
    expect((await traiterSynchro(requete({ cookie: `${NOM_COOKIE_SESSION}=abc.def` }), await deps())).status).toBe(401);
  });
});

describe("dependancesParDefaut", () => {
  afterEach(() => reinitialiserBanqueUnique());
  it("le jour est celui de Paris, y compris à cheval sur minuit", () => {
    expect(jourParis(new Date("2026-11-14T23:30:00Z"))).toBe("2026-11-15"); // 00h30 à Paris
    expect(jourParis(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15"); // heure d'été
    expect(jourParis(new Date("2026-11-14T22:30:00Z"))).toBe("2026-11-14"); // 23h30 à Paris
  });
  it("hors démo : dépôt Firestore par le point unique d'accès, état en Firestore", async () => {
    const banque = new BanqueMemoire();
    await new DepotFirestore(banque, "famille-test").initialiserFamille(familleFictive);
    await banqueUnique("projet-test", async () => banque);
    const env = { FAMILLE_ID: "famille-test", FIRESTORE_PROJECT_ID: "projet-test" };
    const d = dependancesParDefaut(env, () => new Date("2026-11-14T23:30:00Z"));
    expect((await (await d.depot()).lireFamille()).nom).toBe(familleFictive.nom);
    await d.stockage.ecrire({ adulteId: "alex", statut: "ok", crees: 0, modifies: 0, supprimes: 0, erreurs: [] } as never);
    expect((await new StockageEtatFirestore(banque, "famille-test").lire("alex"))?.statut).toBe("ok");
  });
  it("hors démo sans configuration : ErreurNonConfigure, jamais de dépôt de démonstration", async () => {
    await expect(dependancesParDefaut({}).depot()).rejects.toThrow(ErreurNonConfigure);
  });
});
