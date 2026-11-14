import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adulteDepuisEmail } from "../acces/acces";
import { familleFictive } from "../domaine/fixture-famille";
import { creerJeton, NOM_COOKIE_SESSION } from "../auth/session";
import { traiterAbonnement, traiterRecapitulatif, secretValide, validerAbonnement } from "./acces-notifications";
import { StockageAbonnementsMemoire } from "./stockages-memoire";
import type { RecapitulatifService } from "./recapitulatif";

const CLE_SESSION = "s".repeat(40);
const SECRET = "n".repeat(40);
const ENV = {
  SESSION_SECRET: CLE_SESSION,
  ALLOWED_EMAILS: "alex@exemple.invalid,sam@exemple.invalid",
  ADULTES_EMAILS: "alex=alex@exemple.invalid,sam=sam@exemple.invalid",
};
const cookie = (email: string) => `${NOM_COOKIE_SESSION}=${creerJeton({ email, nom: "X" }, Date.now(), CLE_SESSION)}`;
const abo = (n: string) => ({ endpoint: `https://push.exemple.invalid/${n}`, keys: { p256dh: "cle", auth: "auth" } });

function serviceEspion() {
  const appels: Date[] = [];
  const fabrique = vi.fn(
    async () =>
      ({
        envoyerRecapitulatifs: async (d: Date) => {
          appels.push(d);
          return { alex: { statut: "envoye", texte: "TEXTE-PRIVE", source: "repli", appareils: 1 } };
        },
      }) as unknown as RecapitulatifService,
  );
  return { appels, fabrique };
}
const requete = (en: Record<string, string> = {}, methode = "POST", corps?: unknown) =>
  new Request("https://app.exemple.invalid/api/notifications/x", {
    method: methode,
    headers: { "content-type": "application/json", ...en },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("route du récapitulatif", () => {
  it("refusée sans secret ni session, sans toucher à la base", async () => {
    const { fabrique } = serviceEspion();
    const r = await traiterRecapitulatif(requete(), { secret: SECRET, env: ENV, service: fabrique });
    expect(r.status).toBe(401);
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("refusée avec un mauvais secret, un secret trop court ou un secret absent de la configuration", async () => {
    const { fabrique } = serviceEspion();
    expect((await traiterRecapitulatif(requete({ authorization: "Bearer faux" }), { secret: SECRET, env: ENV, service: fabrique })).status).toBe(401);
    expect((await traiterRecapitulatif(requete({ authorization: "Bearer court" }), { secret: "court", env: ENV, service: fabrique })).status).toBe(401);
    expect((await traiterRecapitulatif(requete({ authorization: "Bearer " + SECRET }), { secret: undefined, env: ENV, service: fabrique })).status).toBe(401);
    expect((await traiterRecapitulatif(requete({ authorization: SECRET }), { secret: SECRET, env: ENV, service: fabrique })).status).toBe(401);
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("refusée avec une session falsifiée ou d'une adresse non autorisée", async () => {
    const { fabrique } = serviceEspion();
    expect((await traiterRecapitulatif(requete({ cookie: `${NOM_COOKIE_SESSION}=abc.def` }), { secret: SECRET, env: ENV, service: fabrique })).status).toBe(401);
    expect((await traiterRecapitulatif(requete({ cookie: cookie("intrus@exemple.invalid") }), { secret: SECRET, env: ENV, service: fabrique })).status).toBe(401);
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("acceptée avec le secret ou avec une session, et ne rend que des statuts", async () => {
    const a = serviceEspion();
    const r1 = await traiterRecapitulatif(requete({ authorization: "Bearer " + SECRET }), { secret: SECRET, env: ENV, service: a.fabrique });
    expect(r1.status).toBe(200);
    const texte = JSON.stringify(await r1.json());
    expect(texte).toBe(JSON.stringify({ adultes: { alex: "envoye" } }));
    expect(texte).not.toContain("TEXTE-PRIVE");
    const r2 = await traiterRecapitulatif(requete({ cookie: cookie("sam@exemple.invalid") }), { secret: SECRET, env: ENV, service: a.fabrique });
    expect(r2.status).toBe(200);
    expect(a.appels).toHaveLength(2);
  });

  it("une panne rend 500 sans détail", async () => {
    const r = await traiterRecapitulatif(requete({ authorization: "Bearer " + SECRET }), {
      secret: SECRET,
      env: ENV,
      service: async () => {
        throw new Error("détail interne");
      },
    });
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("détail");
  });

  it("secretValide : exige 32 caractères", () => {
    expect(secretValide("Bearer " + SECRET, SECRET)).toBe(true);
    expect(secretValide("Bearer abc", "abc")).toBe(false);
  });
});

describe("route de l'abonnement", () => {
  const monter = () => {
    const abonnements = new StockageAbonnementsMemoire();
    const adulteConnecte = vi.fn(async (jeton: string | undefined) => {
      if (!jeton) return null;
      const email = /^(.+)\|/.exec(jeton)?.[1];
      return email ? adulteDepuisEmail(email, familleFictive, ENV.ADULTES_EMAILS) : null;
    });
    return { abonnements, adulteConnecte, d: { env: ENV, abonnements, adulteConnecte } };
  };
  const connecte = (email: string) => ({ cookie: `${NOM_COOKIE_SESSION}=${email}|jeton` });

  it("refusé sans session, sans rien enregistrer", async () => {
    const { d, abonnements } = monter();
    expect((await traiterAbonnement(requete({}, "POST", abo("a")), d)).status).toBe(401);
    expect((await traiterAbonnement(requete({ authorization: "Bearer " + SECRET }, "POST", abo("a")), d)).status).toBe(401);
    expect(await abonnements.lister("alex")).toEqual([]);
  });

  it("lié à l'adulte de la session, jamais à un adulte fourni par le client", async () => {
    const { d, abonnements } = monter();
    expect((await traiterAbonnement(requete(connecte("alex@exemple.invalid"), "POST", abo("tel")), d)).status).toBe(200);
    expect((await abonnements.lister("alex")).map((a) => a.endpoint)).toEqual([abo("tel").endpoint]);
    expect(await abonnements.lister("sam")).toEqual([]);

    // Un champ adulte dans le corps est refusé, pas obéi.
    const triche = await traiterAbonnement(requete(connecte("alex@exemple.invalid"), "POST", { ...abo("autre"), adulteId: "sam" }), d);
    expect(triche.status).toBe(400);
    const tricheUrl = await traiterAbonnement(
      new Request("https://app.exemple.invalid/api/notifications/abonnement?adulteId=sam", {
        method: "POST",
        headers: { "content-type": "application/json", ...connecte("alex@exemple.invalid") },
        body: JSON.stringify(abo("url")),
      }),
      d,
    );
    expect(tricheUrl.status).toBe(200);
    expect(await abonnements.lister("sam")).toEqual([]);
    expect(await abonnements.lister("alex")).toHaveLength(2);
  });

  it("DELETE retire l'appareil de l'adulte connecté seulement", async () => {
    const { d, abonnements } = monter();
    await abonnements.ajouter("alex", abo("a"));
    await abonnements.ajouter("sam", abo("s"));
    const autre = await traiterAbonnement(requete(connecte("sam@exemple.invalid"), "DELETE", { endpoint: abo("a").endpoint }), d);
    expect(autre.status).toBe(200);
    expect(await abonnements.lister("alex")).toHaveLength(1);
    expect((await traiterAbonnement(requete(connecte("alex@exemple.invalid"), "DELETE", { endpoint: abo("a").endpoint }), d)).status).toBe(200);
    expect(await abonnements.lister("alex")).toEqual([]);
    expect(await abonnements.lister("sam")).toHaveLength(1);
    expect((await traiterAbonnement(requete({}, "DELETE", { endpoint: abo("s").endpoint }), d)).status).toBe(401);
  });

  it("refuse les corps invalides", async () => {
    const { d } = monter();
    const c = connecte("alex@exemple.invalid");
    const mauvais = [
      {},
      { endpoint: "http://x.invalid/a", keys: { p256dh: "a", auth: "b" } },
      { endpoint: abo("a").endpoint, keys: { p256dh: "a" } },
      { endpoint: abo("a").endpoint, keys: { p256dh: "a", auth: "b", x: 1 } },
      [],
      "x",
    ];
    for (const corps of mauvais) {
      expect((await traiterAbonnement(requete(c, "POST", corps), d)).status, JSON.stringify(corps)).toBe(400);
    }
    expect((await traiterAbonnement(requete({ ...c, "content-type": "text/plain" }, "POST", abo("a")), d)).status).toBe(415);
    const brut = (corps: string) => new Request("https://x.invalid/", { method: "POST", headers: { "content-type": "application/json", ...c }, body: corps });
    expect((await traiterAbonnement(brut("{pas json"), d)).status).toBe(400);
    expect((await traiterAbonnement(brut("x".repeat(5000)), d)).status).toBe(413);
  });

  it("accepte la forme de PushSubscription.toJSON()", () => {
    expect(validerAbonnement({ ...abo("a"), expirationTime: null })).toEqual(abo("a"));
  });
});
