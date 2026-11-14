/**
 * Gestionnaires des routes /api/dictee : RÉSERVÉ AU SERVEUR. Sans dépendance à Next, donc testables.
 * La session est contrôlée AVANT toute lecture en base ; l'auteur vient de la session, jamais du corps.
 */
import { ErreurNonConfigure } from "../acces/depot";
import { controlerAcces } from "../acces/garde";
import type { Env } from "../acces/acces";
import { lireCookie, NOM_COOKIE_SESSION } from "../auth/session";
import type { DepotFamille } from "../domaine/depot";
import { ErreurDomaine } from "../domaine/depot";
import type { Banque } from "../firestore/banque";
import { configurationIADepuisEnv } from "../ia/configuration";
import { PlafondAtteint } from "../ia/plafond";
import { SortieDicteeInvalide } from "../ia/sortie-dictee";
import type { DicteeService } from "./service";
import { AudioInvalide, ChoixInvalide, PropositionIntrouvable, type Retenus } from "./types";

export interface DependancesRoutes {
  env: Env;
  banque?: Banque;
  /** Construit le service pour la requête ; les stockages et clients qu'il utilise sont partagés. */
  service(contexte: { depot: DepotFamille; env: Env }): Promise<DicteeService>;
}

const json = (corps: unknown, status: number) => Response.json(corps, { status, headers: { "cache-control": "no-store" } });
const erreur = (status: number, code: string, message: string) => json({ erreur: { code, message } }, status);

/** Jour courant (Europe/Paris), AAAA-MM-JJ. */
function aujourdhui(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Requête d'un autre site : refusée (le cookie de session est SameSite=Lax, ceci double la protection). */
function memeOrigine(request: Request): boolean {
  const origine = request.headers.get("origin");
  return origine === null || origine === new URL(request.url).origin;
}

async function entrer(request: Request, d: DependancesRoutes) {
  if (!memeOrigine(request)) return { reponse: erreur(403, "origine", "Requête refusée.") };
  const url = new URL(request.url);
  const acces = await controlerAcces({
    env: d.env,
    date: aujourdhui(),
    jeton: lireCookie(request, NOM_COOKIE_SESSION),
    adulteParam: url.searchParams.get("adulte") ?? undefined,
    banque: d.banque,
  });
  if (!acces.ok) return { reponse: erreur(401, "non_connecte", "Connexion requise.") };
  return { acces };
}

/** Correspondance erreur -> réponse propre en français ; rien d'interne n'est exposé. */
function repondreErreur(e: unknown): Response {
  if (e instanceof PlafondAtteint) return erreur(429, "plafond_atteint", e.message);
  if (e instanceof ErreurNonConfigure) return erreur(503, "non_configure", "Service indisponible : application non configurée.");
  if (e instanceof AudioInvalide) return erreur(e.raison === "trop_gros" ? 413 : 400, `audio_${e.raison}`, e.message);
  if (e instanceof SortieDicteeInvalide) return erreur(502, "sortie_invalide", "L'assistant n'a pas pu comprendre la dictée. Rien n'a été enregistré, réessayez.");
  if (e instanceof PropositionIntrouvable) return erreur(404, "proposition_introuvable", e.message);
  if (e instanceof ChoixInvalide) return erreur(400, "choix_invalide", "Les éléments retenus sont invalides.");
  if (e instanceof ErreurDomaine) return erreur(400, "invalide", "Demande invalide.");
  console.error("Erreur dictée", e instanceof Error ? e.name : "inconnue");
  return erreur(500, "erreur", "Une erreur est survenue.");
}

/** Lit le corps en s'arrêtant dès que la taille maximale est dépassée (null). */
export async function lireCorpsBorne(request: Request, maxOctets: number): Promise<Uint8Array | null> {
  const annonce = Number(request.headers.get("content-length"));
  if (Number.isFinite(annonce) && annonce > maxOctets) return null;
  if (!request.body) return new Uint8Array();
  const lecteur = request.body.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxOctets) {
      await lecteur.cancel();
      return null;
    }
    morceaux.push(value);
  }
  const tout = new Uint8Array(total);
  let i = 0;
  for (const m of morceaux) {
    tout.set(m, i);
    i += m.byteLength;
  }
  return tout;
}

/** POST /api/dictee : corps = audio brut, en-tête Content-Type = son type. Rend la proposition (aucune écriture). */
export async function traiterProposer(request: Request, d: DependancesRoutes): Promise<Response> {
  try {
    const e = await entrer(request, d);
    if (e.reponse) return e.reponse;
    const max = configurationIADepuisEnv(d.env).maxOctetsAudio;
    const octets = await lireCorpsBorne(request, max);
    if (octets === null) return erreur(413, "audio_trop_gros", `L'enregistrement est trop long (maximum ${Math.floor(max / (1024 * 1024))} Mo).`);
    const service = await d.service({ depot: e.acces.depot, env: d.env });
    const proposition = await service.proposer({ auteurId: e.acces.adulteId, audio: { octets, mimeType: request.headers.get("content-type") ?? "" } });
    return json(proposition, 200);
  } catch (err) {
    return repondreErreur(err);
  }
}

const TAILLE_MAX_VALIDATION = 64 * 1024;

/** POST /api/dictee/valider : corps JSON { propositionId, retenus }. Seule route qui écrit. */
export async function traiterValider(request: Request, d: DependancesRoutes): Promise<Response> {
  try {
    const e = await entrer(request, d);
    if (e.reponse) return e.reponse;
    const brut = await lireCorpsBorne(request, TAILLE_MAX_VALIDATION);
    if (brut === null) return erreur(413, "corps_trop_gros", "Requête trop volumineuse.");
    let corps: unknown;
    try {
      corps = JSON.parse(new TextDecoder().decode(brut));
    } catch {
      return erreur(400, "json_invalide", "Requête illisible.");
    }
    const c = corps as { propositionId?: unknown; retenus?: unknown } | null;
    if (typeof c !== "object" || c === null || typeof c.propositionId !== "string" || typeof c.retenus !== "object" || c.retenus === null) {
      return erreur(400, "json_invalide", "Requête illisible.");
    }
    const service = await d.service({ depot: e.acces.depot, env: d.env });
    const resultat = await service.valider({ auteurId: e.acces.adulteId, propositionId: c.propositionId, retenus: c.retenus as Retenus });
    return json(resultat, 200);
  } catch (err) {
    return repondreErreur(err);
  }
}
