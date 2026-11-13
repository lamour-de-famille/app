import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Identite } from "./identite";

export const NOM_COOKIE_SESSION = "session";
export const NOM_COOKIE_ETAT = "etat_oauth";
export const DUREE_SESSION_S = 7 * 24 * 3600;
const DUREE_ETAT_S = 600;

export type Session = Identite & { exp: number };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET absent ou trop court (32 caractères minimum)");
  return s;
}

function signer(donnees: string, cle: string): string {
  return createHmac("sha256", cle).update(donnees).digest("base64url");
}

export function creerJeton(identite: Identite, maintenant = Date.now(), cle = secret()): string {
  const charge: Session = { email: identite.email, nom: identite.nom, exp: Math.floor(maintenant / 1000) + DUREE_SESSION_S };
  const corps = Buffer.from(JSON.stringify(charge)).toString("base64url");
  return `${corps}.${signer(corps, cle)}`;
}

/** Retourne la session, ou null si le jeton est falsifié, mal formé ou expiré. */
export function verifierJeton(jeton: string | undefined, maintenant = Date.now(), cle = secret()): Session | null {
  if (!jeton) return null;
  const [corps, signature, reste] = jeton.split(".");
  if (!corps || !signature || reste !== undefined) return null;
  const attendu = Buffer.from(signer(corps, cle));
  const recu = Buffer.from(signature);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
  try {
    const s = JSON.parse(Buffer.from(corps, "base64url").toString("utf8")) as Session;
    if (typeof s.email !== "string" || typeof s.exp !== "number") return null;
    return s.exp * 1000 > maintenant ? s : null;
  } catch {
    return null;
  }
}

export function lireCookie(request: Request, nom: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === nom) return part.slice(i + 1).trim();
  }
  return undefined;
}

export function cookie(nom: string, valeur: string, dureeS: number): string {
  return `${nom}=${valeur}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${dureeS}`;
}

export const cookieSession = (identite: Identite) => cookie(NOM_COOKIE_SESSION, creerJeton(identite), DUREE_SESSION_S);
export const effacerCookie = (nom: string) => cookie(nom, "", 0);

export function nouvelEtat(): { etat: string; cookie: string } {
  const etat = randomBytes(32).toString("base64url");
  return { etat, cookie: cookie(NOM_COOKIE_ETAT, etat, DUREE_ETAT_S) };
}

export function etatValide(request: Request, recu: string | null): boolean {
  const attendu = lireCookie(request, NOM_COOKIE_ETAT);
  if (!attendu || !recu || attendu.length !== recu.length) return false;
  return timingSafeEqual(Buffer.from(attendu), Buffer.from(recu));
}

/**
 * Protège une route ou une page serveur : retourne la session ou lève une Response 401.
 * Usage dans une route : `try { const s = exigerSession(request) } catch (e) { if (e instanceof Response) return e; throw e }`
 */
export function exigerSession(request: Request): Session {
  const session = verifierJeton(lireCookie(request, NOM_COOKIE_SESSION));
  if (!session) throw Response.json({ erreur: "Connexion requise" }, { status: 401 });
  return session;
}
