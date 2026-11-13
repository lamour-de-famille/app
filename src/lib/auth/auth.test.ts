import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estAutorise, listeAutorisee } from "./autorisation";
import { demarrerConnexion, terminerConnexion } from "./flux";
import { FournisseurIdentiteFactice } from "./identite";
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
    expect(exigerSession(ok).nom).toBe("Alex");
    let leve: unknown;
    try {
      exigerSession(new Request("https://x.invalid/"));
    } catch (e) {
      leve = e;
    }
    expect((leve as Response).status).toBe(401);
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
