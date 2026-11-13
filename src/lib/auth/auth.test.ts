import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estAutorise, listeAutorisee } from "./autorisation";
import { demarrerConnexion, redirectUri, terminerConnexion } from "./flux";
import { FournisseurIdentiteFactice, FournisseurIdentiteGoogle, fournisseurDepuisEnv } from "./identite";
import { NOM_COOKIE_ETAT, NOM_COOKIE_SESSION, creerJeton, exigerSession, verifierJeton } from "./session";

const CLE = "x".repeat(40);
const alex = { email: "alex@exemple.invalid", nom: "Alex" };
const liste = listeAutorisee("Alex@Exemple.invalid, sam@exemple.invalid");

beforeEach(() => vi.stubEnv("SESSION_SECRET", CLE));
afterEach(() => vi.unstubAllEnvs());

describe("liste d'autorisation", () => {
  it("accepte une adresse listée sans tenir compte de la casse", () => {
    expect(estAutorise("ALEX@exemple.INVALID", liste)).toBe(true);
  });
  it("refuse une adresse absente", () => {
    expect(estAutorise("leo@exemple.invalid", liste)).toBe(false);
  });
  it("refuse tout si la liste est vide", () => {
    expect(estAutorise("alex@exemple.invalid", listeAutorisee(""))).toBe(false);
    expect(estAutorise("alex@exemple.invalid", [])).toBe(false);
  });
});

describe("session", () => {
  it("relit un jeton valide", () => {
    expect(verifierJeton(creerJeton(alex))?.email).toBe(alex.email);
  });
  it("rejette un jeton falsifié", () => {
    const [corps, sig] = creerJeton(alex).split(".");
    const faux = Buffer.from(JSON.stringify({ ...alex, email: "nina@exemple.invalid", exp: 9e12 })).toString("base64url");
    expect(verifierJeton(`${faux}.${sig}`)).toBeNull();
    expect(verifierJeton(`${corps}.AAAA`)).toBeNull();
    expect(verifierJeton("n'importe quoi")).toBeNull();
  });
  it("rejette un jeton expiré", () => {
    const jeton = creerJeton(alex, Date.now() - 8 * 24 * 3600 * 1000);
    expect(verifierJeton(jeton)).toBeNull();
  });
  it("exigerSession renvoie la session valide et lève une 401 sinon", () => {
    const ok = new Request("https://x.invalid/", { headers: { cookie: `${NOM_COOKIE_SESSION}=${creerJeton(alex)}` } });
    expect(exigerSession(ok, liste).nom).toBe("Alex");
    let leve: unknown;
    try {
      exigerSession(new Request("https://x.invalid/"));
    } catch (e) {
      leve = e;
    }
    expect((leve as Response).status).toBe(401);
  });
  it("exigerSession refuse une session valide dont l'adresse a été retirée de la liste", () => {
    const requete = new Request("https://x.invalid/", { headers: { cookie: `${NOM_COOKIE_SESSION}=${creerJeton(alex)}` } });
    expect(exigerSession(requete, liste).email).toBe(alex.email);
    let leve: unknown;
    try {
      exigerSession(requete, listeAutorisee("sam@exemple.invalid"));
    } catch (e) {
      leve = e;
    }
    expect((leve as Response).status).toBe(401);
  });
  it("nomme les cookies avec le préfixe __Host-", () => {
    expect(NOM_COOKIE_SESSION.startsWith("__Host-")).toBe(true);
    expect(NOM_COOKIE_ETAT.startsWith("__Host-")).toBe(true);
  });
});

describe("flux de connexion", () => {
  const fournisseur = new FournisseurIdentiteFactice({ [alex.email]: "Alex" });

  function demarrer() {
    const r = demarrerConnexion(new Request("https://app.exemple.invalid/api/auth/google"), fournisseur);
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    const etat = new URL(r.headers.get("location")!).searchParams.get("state")!;
    return { etat, cookie: cookie.split(";")[0]! };
  }
  const retour = (params: string, cookie: string) =>
    new Request(`https://app.exemple.invalid/api/auth/callback?${params}`, { headers: { cookie } });

  it("connecte une adresse autorisée avec cookie de session sécurisé", async () => {
    const { etat, cookie } = demarrer();
    const r = await terminerConnexion(retour(`state=${etat}&code=code-${alex.email}`, cookie), fournisseur, liste);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/");
    const cookies = r.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith(`${NOM_COOKIE_SESSION}=`))!;
    expect(session).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(cookies.some((c) => c.startsWith(`${NOM_COOKIE_ETAT}=;`))).toBe(true);
  });
  it("refuse une adresse non autorisée sans créer de session", async () => {
    const { etat, cookie } = demarrer();
    const r = await terminerConnexion(retour(`state=${etat}&code=code-leo@exemple.invalid`, cookie), fournisseur, liste);
    expect(r.headers.get("location")).toContain("erreur=non-autorise");
    expect(r.headers.getSetCookie().some((c) => c.startsWith(`${NOM_COOKIE_SESSION}=`))).toBe(false);
  });
  it("refuse un state invalide, absent ou sans cookie", async () => {
    const { cookie } = demarrer();
    for (const p of ["state=autre&code=code-alex@exemple.invalid", "code=code-alex@exemple.invalid"]) {
      const r = await terminerConnexion(retour(p, cookie), fournisseur, liste);
      expect(r.headers.get("location")).toContain("erreur=etat");
    }
    const sansCookie = await terminerConnexion(
      new Request("https://app.exemple.invalid/api/auth/callback?state=a&code=code-alex@exemple.invalid"),
      fournisseur,
      liste,
    );
    expect(sansCookie.headers.get("location")).toContain("erreur=etat");
  });
  it("gère un code rejeté par le fournisseur", async () => {
    const { etat, cookie } = demarrer();
    const r = await terminerConnexion(retour(`state=${etat}&code=mauvais`, cookie), fournisseur, liste);
    expect(r.headers.get("location")).toContain("erreur=echec");
  });
});

describe("flux sans configuration", () => {
  const manquant = () => fournisseurDepuisEnv({} as NodeJS.ProcessEnv);
  it("redirige vers /connexion?erreur=echec au démarrage si les identifiants manquent", () => {
    const r = demarrerConnexion(new Request("https://app.exemple.invalid/api/auth/google"), manquant);
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toContain("/connexion?erreur=echec");
  });
  it("redirige vers /connexion?erreur=echec au retour si les identifiants manquent", async () => {
    const f = new FournisseurIdentiteFactice();
    const d = demarrerConnexion(new Request("https://app.exemple.invalid/api/auth/google"), f);
    const etat = new URL(d.headers.get("location")!).searchParams.get("state")!;
    const cookie = d.headers.get("set-cookie")!.split(";")[0]!;
    const r = await terminerConnexion(
      new Request(`https://app.exemple.invalid/api/auth/callback?state=${etat}&code=x`, { headers: { cookie } }),
      manquant,
      liste,
    );
    expect(r.headers.get("location")).toContain("erreur=echec");
  });
});

describe("URI de redirection", () => {
  const req = new Request("http://interne.invalid:3000/api/auth/google");
  it("utilise APP_URL quand elle est définie", () => {
    expect(redirectUri(req, "https://app.exemple.invalid")).toBe("https://app.exemple.invalid/api/auth/callback");
  });
  it("retombe sur l'origine de la requête sinon", () => {
    expect(redirectUri(req, undefined)).toBe("http://interne.invalid:3000/api/auth/callback");
  });
});

describe("FournisseurIdentiteGoogle.echangerCode (faux fetch)", () => {
  const ID = "client-fictif";
  const MAINTENANT = 1_800_000_000_000;
  const jetonId = (charge: object) =>
    `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(charge)).toString("base64url")}.sig`;
  const valide = {
    iss: "https://accounts.google.com",
    aud: ID,
    exp: MAINTENANT / 1000 + 3600,
    email: alex.email,
    email_verified: true,
    name: "Alex",
  };
  const fournisseur = (reponse: Response | Error) => {
    const appel = vi.fn(async () => {
      if (reponse instanceof Error) throw reponse;
      return reponse;
    });
    return { f: new FournisseurIdentiteGoogle(ID, "secret-fictif", appel as unknown as typeof fetch, () => MAINTENANT), appel };
  };
  const avecJeton = (charge: object) => Response.json({ id_token: jetonId(charge) });
  const echanger = (r: Response | Error) => fournisseur(r).f.echangerCode("code", "https://app.exemple.invalid/api/auth/callback");

  it("accepte un jeton d'identité valide et envoie le bon échange", async () => {
    const { f, appel } = fournisseur(avecJeton(valide));
    await expect(f.echangerCode("c", "https://app.exemple.invalid/api/auth/callback")).resolves.toEqual(alex);
    const corps = String((appel.mock.calls[0] as unknown as [string, RequestInit])[1].body);
    expect(corps).toContain("grant_type=authorization_code");
  });
  it("accepte l'émetteur sans schéma", async () => {
    await expect(echanger(avecJeton({ ...valide, iss: "accounts.google.com" }))).resolves.toEqual(alex);
  });
  it("rejette un aud différent", async () => {
    await expect(echanger(avecJeton({ ...valide, aud: "autre" }))).rejects.toThrow();
  });
  it("rejette un iss faux", async () => {
    await expect(echanger(avecJeton({ ...valide, iss: "https://faux.exemple.invalid" }))).rejects.toThrow();
  });
  it("rejette email_verified false ou absent", async () => {
    await expect(echanger(avecJeton({ ...valide, email_verified: false }))).rejects.toThrow();
    await expect(echanger(avecJeton({ ...valide, email_verified: undefined }))).rejects.toThrow();
  });
  it("rejette un jeton expiré ou sans exp", async () => {
    await expect(echanger(avecJeton({ ...valide, exp: MAINTENANT / 1000 - 1 }))).rejects.toThrow();
    await expect(echanger(avecJeton({ ...valide, exp: undefined }))).rejects.toThrow();
  });
  it("rejette un id_token absent ou mal formé", async () => {
    await expect(echanger(Response.json({}))).rejects.toThrow();
    await expect(echanger(Response.json({ id_token: "pas-un-jeton" }))).rejects.toThrow();
    await expect(echanger(Response.json({ id_token: "a.!!!.c" }))).rejects.toThrow();
  });
  it("rejette une erreur HTTP ou réseau", async () => {
    await expect(echanger(new Response("{}", { status: 400 }))).rejects.toThrow();
    await expect(echanger(new Error("réseau coupé"))).rejects.toThrow();
  });
});
