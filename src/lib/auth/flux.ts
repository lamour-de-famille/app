import { estAutorise } from "./autorisation";
import type { FournisseurIdentite } from "./identite";
import { NOM_COOKIE_ETAT, cookieSession, effacerCookie, etatValide, nouvelEtat } from "./session";

function redirection(request: Request, chemin: string, cookies: string[] = []): Response {
  const entetes = new Headers({ location: new URL(chemin, request.url).toString() });
  for (const c of cookies) entetes.append("set-cookie", c);
  return new Response(null, { status: 303, headers: entetes });
}

const redirectUri = (request: Request) => new URL("/api/auth/callback", request.url).toString();

export function demarrerConnexion(request: Request, fournisseur: FournisseurIdentite): Response {
  const { etat, cookie } = nouvelEtat();
  return redirection(request, fournisseur.urlAutorisation(etat, redirectUri(request)), [cookie]);
}

export async function terminerConnexion(
  request: Request,
  fournisseur: FournisseurIdentite,
  liste?: string[],
): Promise<Response> {
  const url = new URL(request.url);
  const purge = [effacerCookie(NOM_COOKIE_ETAT)];
  if (!etatValide(request, url.searchParams.get("state"))) return redirection(request, "/connexion?erreur=etat", purge);
  const code = url.searchParams.get("code");
  if (!code) return redirection(request, "/connexion?erreur=refuse", purge);
  try {
    const identite = await fournisseur.echangerCode(code, redirectUri(request));
    if (!estAutorise(identite.email, liste)) return redirection(request, "/connexion?erreur=non-autorise", purge);
    return redirection(request, "/", [...purge, cookieSession(identite)]);
  } catch {
    return redirection(request, "/connexion?erreur=echec", purge);
  }
}
