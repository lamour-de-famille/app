import { describe, expect, it } from "vitest";
import { familleFictive } from "@/lib/domaine/fixture-famille";
import { creerJeton } from "@/lib/auth/session";
import { adulteDepuisEmail, lireCorrespondance, modeDemoActif, resoudreAcces } from "./acces";
import { BanqueMemoire } from "@/lib/firestore/banque-memoire";
import { DepotFirestore } from "@/lib/firestore/depot-firestore";
import { ErreurNonConfigure, obtenirDepot } from "./depot";

const CLE = "cle-de-test-fictive-0123456789-abcdefghij";
const ENV_PROD = { NODE_ENV: "production", ADULTES_EMAILS: "alex=alex@exemple.invalid, sam=Sam@exemple.invalid", ALLOWED_EMAILS: "alex@exemple.invalid,sam@exemple.invalid" };
const jeton = (email: string) => creerJeton({ email, nom: "Test" }, Date.now(), CLE);
const acces = (env: Record<string, string>, over: { jeton?: string; adulteParam?: string } = {}) =>
  resoudreAcces({ env, famille: familleFictive, cle: CLE, ...over });

describe("correspondance e-mail / adulte", () => {
  it("lit la variable, insensible à la casse, ignore les entrées mal formées", () => {
    expect(lireCorrespondance("alex=A@exemple.invalid, mauvais, =x, sam=")).toEqual({ "a@exemple.invalid": "alex" });
  });
  it("ne retient que les adultes de la famille", () => {
    expect(adulteDepuisEmail("sam@EXEMPLE.invalid", familleFictive, ENV_PROD.ADULTES_EMAILS)).toBe("sam");
    expect(adulteDepuisEmail("x@exemple.invalid", familleFictive, "inconnu=x@exemple.invalid")).toBeNull();
    expect(adulteDepuisEmail("z@exemple.invalid", familleFictive, ENV_PROD.ADULTES_EMAILS)).toBeNull();
    expect(adulteDepuisEmail("alex@exemple.invalid", familleFictive, undefined)).toBeNull();
  });
});

describe("mode démonstration", () => {
  it("exige MODE_DEMO=1 ET un environnement non production", () => {
    expect(modeDemoActif({ MODE_DEMO: "1", NODE_ENV: "development" })).toBe(true);
    expect(modeDemoActif({ MODE_DEMO: "1", NODE_ENV: "production" })).toBe(false);
    expect(modeDemoActif({ NODE_ENV: "development" })).toBe(false);
    expect(modeDemoActif({ MODE_DEMO: "true", NODE_ENV: "development" })).toBe(false);
  });
});

describe("garde des pages protégées", () => {
  it("sans session : redirection vers /connexion", () => {
    expect(acces(ENV_PROD)).toEqual({ ok: false, redirection: "/connexion" });
  });
  it("jeton falsifié ou expiré : redirection", () => {
    expect(acces(ENV_PROD, { jeton: "x.y" }).ok).toBe(false);
    const vieux = creerJeton({ email: "alex@exemple.invalid", nom: "A" }, 0, CLE);
    expect(acces(ENV_PROD, { jeton: vieux }).ok).toBe(false);
  });
  it("session valide : l'adulte vient de l'e-mail", () => {
    expect(acces(ENV_PROD, { jeton: jeton("sam@exemple.invalid") })).toEqual({ ok: true, adulteId: "sam", demo: false });
  });
  it("e-mail retiré de la liste autorisée : refus", () => {
    expect(acces({ ...ENV_PROD, ALLOWED_EMAILS: "alex@exemple.invalid" }, { jeton: jeton("sam@exemple.invalid") }).ok).toBe(false);
  });
  it("e-mail autorisé mais absent de ADULTES_EMAILS : redirection explicite, pas de boucle silencieuse", () => {
    expect(acces({ ...ENV_PROD, ADULTES_EMAILS: "" }, { jeton: jeton("alex@exemple.invalid") })).toEqual({
      ok: false,
      redirection: "/connexion?erreur=adulte-absent",
    });
  });
  it("sans session valide : /connexion sans erreur", () => {
    expect(acces(ENV_PROD, { jeton: "x.y" })).toEqual({ ok: false, redirection: "/connexion" });
  });
  it("production : ?adulte= est ignoré, même avec MODE_DEMO=1", () => {
    const env = { ...ENV_PROD, MODE_DEMO: "1" };
    expect(acces(env, { adulteParam: "sam" })).toEqual({ ok: false, redirection: "/connexion" });
    expect(acces(env, { jeton: jeton("alex@exemple.invalid"), adulteParam: "sam" })).toEqual({ ok: true, adulteId: "alex", demo: false });
  });
  it("développement sans MODE_DEMO : session requise, paramètre ignoré", () => {
    expect(acces({ NODE_ENV: "development" }, { adulteParam: "sam" }).ok).toBe(false);
  });
  it("mode démo explicite : ?adulte=alex|sam, défaut alex, valeurs inconnues ignorées", () => {
    const env = { NODE_ENV: "development", MODE_DEMO: "1" };
    expect(acces(env, { adulteParam: "sam" })).toEqual({ ok: true, adulteId: "sam", demo: true });
    expect(acces(env, { adulteParam: "pirate" })).toEqual({ ok: true, adulteId: "alex", demo: true });
    expect(acces(env)).toEqual({ ok: true, adulteId: "alex", demo: true });
  });
  it("les ids viennent de famille.adultes, pas de valeurs en dur", () => {
    const env = { NODE_ENV: "development", MODE_DEMO: "1" };
    const famille = { ...familleFictive, adultes: [{ id: "robin", prenom: "Robin", role: "parent" }, { id: "kim", prenom: "Kim", role: "parent" }] } as typeof familleFictive;
    const r = (adulteParam?: string) => resoudreAcces({ env, famille, adulteParam });
    expect(r("kim")).toEqual({ ok: true, adulteId: "kim", demo: true });
    expect(r("sam")).toEqual({ ok: true, adulteId: "robin", demo: true });
    expect(r()).toEqual({ ok: true, adulteId: "robin", demo: true });
  });
});

describe("obtenirDepot", () => {
  const PROD = { NODE_ENV: "production", MODE_DEMO: "1" };
  it("hors démo, la famille fictive n'est jamais lue : la famille vient de la base", async () => {
    const banque = new BanqueMemoire();
    const reelle = {
      ...familleFictive,
      nom: "Famille Réelle Test",
      adultes: [{ id: "robin", prenom: "Robin", role: "parent" }, { id: "kim", prenom: "Kim", role: "parent" }],
    } as typeof familleFictive;
    await new DepotFirestore(banque, "fam-1").initialiserFamille(reelle);
    for (const env of [PROD, { NODE_ENV: "development" }]) {
      const d = await obtenirDepot("2026-11-14", { ...env, FAMILLE_ID: "fam-1" }, banque);
      const f = await d.lireFamille();
      expect(f.nom).toBe("Famille Réelle Test");
      expect(f.adultes.map((a) => a.id)).toEqual(["robin", "kim"]);
      expect(await d.listerDemandes()).toEqual([]);
    }
  });
  it("configuration absente : erreur explicite, aucune fixture", async () => {
    await expect(obtenirDepot("2026-11-14", PROD)).rejects.toBeInstanceOf(ErreurNonConfigure);
    await expect(obtenirDepot("2026-11-14", { ...PROD, FAMILLE_ID: "fam-1" })).rejects.toThrow(/FIRESTORE_PROJECT_ID/);
    await expect(obtenirDepot("2026-11-14", { ...PROD, FIRESTORE_PROJECT_ID: "p" })).rejects.toThrow(/FAMILLE_ID/);
  });
  it("famille absente de la base : erreur explicite", async () => {
    await expect(obtenirDepot("2026-11-14", { ...PROD, FAMILLE_ID: "fam-1" }, new BanqueMemoire())).rejects.toThrow(
      /initialiser-famille/,
    );
  });
  it("une écriture non configurée est refusée et rien n'est écrit", async () => {
    const ecrire = async () => (await obtenirDepot("2026-11-14", PROD)).repondreEchange("alex", "d", "acceptee");
    await expect(ecrire()).rejects.toBeInstanceOf(ErreurNonConfigure);
    const banque = new BanqueMemoire();
    const sansFamille = async () =>
      (await obtenirDepot("2026-11-14", { ...PROD, FAMILLE_ID: "x" }, banque)).repondreEchange("alex", "d", "acceptee");
    await expect(sansFamille()).rejects.toBeInstanceOf(ErreurNonConfigure);
    expect(banque.compter()).toBe(0);
  });
  it("mode démo : dépôt peuplé", async () => {
    const d = await obtenirDepot("2026-11-14", { NODE_ENV: "development", MODE_DEMO: "1" });
    expect((await d.listerPresences({ du: "2026-11-14", au: "2026-11-14" })).length).toBeGreaterThan(0);
  });
});

describe("secret de session absent", () => {
  it("redirige vers /connexion au lieu de lever une erreur", () => {
    const sansSecret = resoudreAcces({ env: ENV_PROD, famille: familleFictive, jeton: jeton("alex@exemple.invalid") });
    expect(sansSecret).toEqual({ ok: false, redirection: "/connexion" });
    expect(resoudreAcces({ env: { ...ENV_PROD, SESSION_SECRET: "court" }, famille: familleFictive, jeton: "a.b" }).ok).toBe(false);
  });
});

describe("banque Firestore unique", () => {
  it("une seule instance est réutilisée entre les appels", async () => {
    const { banqueUnique, reinitialiserBanqueUnique } = await import("./depot");
    reinitialiserBanqueUnique();
    let ouvertures = 0;
    const ouvrir = async () => {
      ouvertures++;
      return new BanqueMemoire();
    };
    const a = await banqueUnique("p", ouvrir);
    const b = await banqueUnique("p", ouvrir);
    expect(a).toBe(b);
    expect(ouvertures).toBe(1);
    reinitialiserBanqueUnique();
  });
});
