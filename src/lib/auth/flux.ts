import { estAutorise } from "./autorisation";
import type { FournisseurIdentite } from "./identite";
import { NOM_COOKIE_ETAT, cookieSession, effacerCookie, etatValide, nouvelEtat } from "./session";

function redirection(request: Request, chemin: string, cookies: string[] = []): Response {
  const entetes = new Headers({ location: new URL(chemin, request.url).toString() });
  for (const c of cookies) entetes.append("set-cookie", c);
  return new Response(null, { status: 303, headers: entetes });
}

/** Origine publique : `APP_URL` si définie, sinon l'origine de la requête (développement local). */
export function redirectUri(request: Request, appUrl: string | undefined = process.env.APP_URL): string {
  return new URL("/api/auth/callback", appUrl || request.url).toString();
}

type Source = FournisseurIdentite | (() => FournisseurIdentite);
const resoudre = (s: Source) => (typeof s === "function" ? s() : s);

export function demarrerConnexion(request: Request, source: Source): Response {
  try {
    const { etat, cookie } = nouvelEtat();
    return redirection(request, resoudre(source).urlAutorisation(etat, redirectUri(request)), [cookie]);
  } catch {
    // Identifiants manquants ou URL invalide : retour propre plutôt qu'une erreur 500.
    return redirection(request, "/connexion?erreur=echec");
  }
}

export async function terminerConnexion(
  request: Request,
  source: Source,
  liste?: string[],
): Promise<Response> {
  const url = new URL(request.url);
  const purge = [effacerCookie(NOM_COOKIE_ETAT)];
  if (!etatValide(request, url.searchParams.get("state"))) return redirection(request, "/connexion?erreur=etat", purge);
  const code = url.searchParams.get("code");
  if (!code) return redirection(request, "/connexion?erreur=refuse", purge);
  try {
    const identite = await resoudre(source).echangerCode(code, redirectUri(request));
    if (!estAutorise(identite.email, liste)) return redirection(request, "/connexion?erreur=non-autorise", purge);
    return redirection(request, "/", [...purge, cookieSession(identite)]);
  } catch {
    return redirection(request, "/connexion?erreur=echec", purge);
  }
}
