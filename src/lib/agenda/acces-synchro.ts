import { createHash, timingSafeEqual } from "node:crypto";
import { estAutorise, listeAutorisee } from "../auth/autorisation";
import { NOM_COOKIE_SESSION, lireCookie, verifierJeton, type Session } from "../auth/session";
import { declencherSynchroAgenda, type DependancesSynchro } from "./declenchement";

const empreinte = (s: string) => createHash("sha256").update(s).digest();

/** `Authorization: Bearer <secret>` comparé à temps constant. Un secret attendu vide refuse toujours. */
export function secretValide(entete: string | null, attendu: string | undefined): boolean {
  if (!attendu || !entete) return false;
  const m = /^Bearer (.+)$/.exec(entete);
  if (!m) return false;
  return timingSafeEqual(empreinte(m[1]!), empreinte(attendu));
}

export type DependancesRoute = DependancesSynchro & { secret?: string; liste?: string[] };

const refus = (status: 401 | 403, erreur: string) =>
  Response.json({ erreur }, { status, headers: status === 401 ? { "WWW-Authenticate": "Bearer" } : {} });

/** Secret partagé (Cloud Scheduler) ou session d'adulte autorisé ; sinon 401 (inconnu) ou 403 (connu mais non autorisé). */
export async function traiterSynchro(request: Request, d: DependancesRoute): Promise<Response> {
  const entete = request.headers.get("authorization");
  if (!secretValide(entete, d.secret)) {
    if (entete) return refus(401, "Identifiants invalides");
    let session: Session | null = null;
    try {
      session = verifierJeton(lireCookie(request, NOM_COOKIE_SESSION));
    } catch {
      session = null;
    }
    if (!session) return refus(401, "Authentification requise");
    if (!estAutorise(session.email, d.liste ?? listeAutorisee())) return refus(403, "Accès refusé");
  }
  try {
    const etats = await declencherSynchroAgenda({ depot: await d.depot(), clients: d.clients, stockage: d.stockage });
    const adultes = Object.fromEntries(
      Object.entries(etats).map(([id, e]) => [
        id,
        { statut: e.statut, crees: e.crees, modifies: e.modifies, supprimes: e.supprimes, erreurs: e.erreurs.length },
      ]),
    );
    return Response.json({ adultes });
  } catch (e) {
    console.error("[synchro] échec de la route", e instanceof Error ? e.name : "inconnue");
    return Response.json({ erreur: "Échec de la synchronisation" }, { status: 500 });
  }
}
