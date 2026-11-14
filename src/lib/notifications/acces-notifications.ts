import { createHash, timingSafeEqual } from "node:crypto";
import { sessionAutorisee, type Env } from "../acces/acces";
import { NOM_COOKIE_SESSION, lireCookie } from "../auth/session";
import type { RecapitulatifService } from "./recapitulatif";
import type { AbonnementPush, StockageAbonnements } from "./types";

const empreinte = (s: string) => createHash("sha256").update(s).digest();

/** Longueur minimale du secret attendu (comme SESSION_SECRET). */
export const LONGUEUR_MIN_SECRET = 32;
const TAILLE_MAX_CORPS = 4096;

/** `Authorization: Bearer <secret>` comparé à temps constant. Un secret attendu vide ou de moins de 32 caractères refuse toujours. */
export function secretValide(entete: string | null, attendu: string | undefined): boolean {
  if (!attendu || attendu.length < LONGUEUR_MIN_SECRET || !entete) return false;
  const m = /^Bearer (.+)$/.exec(entete);
  if (!m) return false;
  return timingSafeEqual(empreinte(m[1]!), empreinte(attendu));
}

const refus = (status: 400 | 401 | 403 | 413 | 415, erreur: string) =>
  Response.json({ erreur }, { status, headers: status === 401 ? { "WWW-Authenticate": "Bearer" } : {} });

export interface DependancesRouteRecapitulatif {
  secret: string | undefined;
  env: Env;
  /** Appelée seulement après authentification : aucune lecture en base avant. */
  service: () => Promise<RecapitulatifService>;
  maintenant?: () => Date;
}

/** Secret partagé (Cloud Scheduler) ou session d'adulte autorisé ; sinon 401 (identifiants absents ou faux). */
export async function traiterRecapitulatif(request: Request, d: DependancesRouteRecapitulatif): Promise<Response> {
  const entete = request.headers.get("authorization");
  if (!secretValide(entete, d.secret)) {
    if (entete) return refus(401, "Identifiants invalides");
    if (!sessionAutorisee(d.env, lireCookie(request, NOM_COOKIE_SESSION))) return refus(401, "Authentification requise");
  }
  try {
    const resultats = await (await d.service()).envoyerRecapitulatifs((d.maintenant ?? (() => new Date()))());
    // Statuts seulement : jamais le texte du message ni les données de la famille.
    return Response.json({ adultes: Object.fromEntries(Object.entries(resultats).map(([id, r]) => [id, r.statut])) });
  } catch (e) {
    console.error("[recapitulatif] échec de la route", e instanceof Error ? e.name : "inconnue");
    return Response.json({ erreur: "Échec du récapitulatif" }, { status: 500 });
  }
}

export interface DependancesRouteAbonnement {
  env: Env;
  abonnements: StockageAbonnements;
  /** Adulte de la session (jeton du cookie), ou null. Appelée seulement si la session est valide. */
  adulteConnecte: (jeton: string | undefined) => Promise<string | null>;
}

const texteBorne = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function endpointValide(v: unknown): v is string {
  if (!texteBorne(v, 2048)) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

/** Abonnement strict : { endpoint (https), keys: { p256dh, auth } } et rien d'autre (surtout pas d'adulte). */
export function validerAbonnement(brut: unknown): AbonnementPush | null {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) return null;
  const o = brut as Record<string, unknown>;
  const cles = Object.keys(o).filter((c) => c !== "expirationTime"); // champ standard de toJSON(), ignoré
  if (cles.some((c) => c !== "endpoint" && c !== "keys")) return null;
  const k = o.keys as Record<string, unknown> | null | undefined;
  if (!endpointValide(o.endpoint) || typeof k !== "object" || k === null || Array.isArray(k)) return null;
  if (Object.keys(k).some((c) => c !== "p256dh" && c !== "auth")) return null;
  if (!texteBorne(k.p256dh, 256) || !texteBorne(k.auth, 256)) return null;
  return { endpoint: o.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}

async function corpsJson(request: Request): Promise<{ ok: true; valeur: unknown } | { ok: false; reponse: Response }> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, reponse: refus(415, "JSON attendu") };
  }
  const texte = await request.text();
  if (texte.length > TAILLE_MAX_CORPS) return { ok: false, reponse: refus(413, "Corps trop grand") };
  try {
    return { ok: true, valeur: JSON.parse(texte) as unknown };
  } catch {
    return { ok: false, reponse: refus(400, "JSON invalide") };
  }
}

/**
 * Enregistre (POST) ou retire (DELETE) un appareil de l'adulte CONNECTÉ. L'adulte vient de la session :
 * il n'est jamais lu dans la requête (un champ en trop est refusé).
 */
export async function traiterAbonnement(request: Request, d: DependancesRouteAbonnement): Promise<Response> {
  const jeton = lireCookie(request, NOM_COOKIE_SESSION);
  const adulteId = await d.adulteConnecte(jeton);
  if (!adulteId) return refus(401, "Authentification requise");
  const corps = await corpsJson(request);
  if (!corps.ok) return corps.reponse;
  try {
    if (request.method === "DELETE") {
      const v = corps.valeur as Record<string, unknown> | null;
      if (typeof v !== "object" || v === null || Object.keys(v).some((c) => c !== "endpoint") || !endpointValide(v.endpoint)) {
        return refus(400, "Abonnement invalide");
      }
      await d.abonnements.retirer(adulteId, v.endpoint as string);
      return Response.json({ ok: true });
    }
    const abonnement = validerAbonnement(corps.valeur);
    if (!abonnement) return refus(400, "Abonnement invalide");
    await d.abonnements.ajouter(adulteId, abonnement);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[abonnement] échec", e instanceof Error ? e.name : "inconnue");
    return Response.json({ erreur: "Échec de l'enregistrement" }, { status: 500 });
  }
}
