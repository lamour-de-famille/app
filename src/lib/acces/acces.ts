import { estAutorise, listeAutorisee } from "@/lib/auth/autorisation";
import { verifierJeton } from "@/lib/auth/session";
import type { Famille } from "@/lib/domaine/types";

export type Env = Record<string, string | undefined>;

/** Mode démonstration : MODE_DEMO=1 explicite ET jamais en production. */
export function modeDemoActif(env: Env = process.env): boolean {
  return env.MODE_DEMO === "1" && env.NODE_ENV !== "production";
}

/** Lit `ADULTES_EMAILS` : `idAdulte=email` séparés par des virgules. Retourne email (minuscules) -> id adulte. */
export function lireCorrespondance(brut: string | undefined): Record<string, string> {
  const r: Record<string, string> = {};
  for (const part of (brut ?? "").split(",")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const id = part.slice(0, i).trim();
    const email = part
      .slice(i + 1)
      .trim()
      .toLowerCase();
    if (id && email) r[email] = id;
  }
  return r;
}

/** Adulte de la famille correspondant à l'e-mail, ou null (inconnu, ou adulte absent de la famille). */
export function adulteDepuisEmail(email: string, famille: Famille, brut: string | undefined): string | null {
  const id = lireCorrespondance(brut)[email.trim().toLowerCase()];
  return id && famille.adultes.some((a) => a.id === id) ? id : null;
}

export type Acces = { ok: true; adulteId: string; demo: boolean } | { ok: false; redirection: "/connexion" };

/**
 * Décision de garde (pure). L'adulte vient de la session ; le paramètre `adulteParam`
 * n'est lu qu'en mode démonstration explicite (MODE_DEMO=1, hors production).
 */
export function resoudreAcces(p: {
  env: Env;
  famille: Famille;
  jeton?: string;
  adulteParam?: string;
  cle?: string;
}): Acces {
  if (modeDemoActif(p.env)) {
    const demande = p.adulteParam === "alex" || p.adulteParam === "sam" ? p.adulteParam : "alex";
    return { ok: true, adulteId: demande, demo: true };
  }
  const session = lireSession(p.jeton, p.cle ?? p.env.SESSION_SECRET);
  if (!session || !estAutorise(session.email, listeAutorisee(p.env.ALLOWED_EMAILS))) {
    return { ok: false, redirection: "/connexion" };
  }
  const adulteId = adulteDepuisEmail(session.email, p.famille, p.env.ADULTES_EMAILS);
  return adulteId ? { ok: true, adulteId, demo: false } : { ok: false, redirection: "/connexion" };
}

/** Session valide ou null. Sans jeton, ou si le secret manque ou est trop court : pas de session (jamais d'erreur 500). */
function lireSession(jeton: string | undefined, cle: string | undefined) {
  if (!jeton || !cle || cle.length < 32) return null;
  return verifierJeton(jeton, Date.now(), cle);
}
