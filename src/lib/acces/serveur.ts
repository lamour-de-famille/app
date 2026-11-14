import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { DepotFamille } from "@/lib/domaine/depot";
import type { Famille } from "@/lib/domaine/types";
import { NOM_COOKIE_SESSION } from "@/lib/auth/session";
import { ErreurNonConfigure } from "./depot";
import { controlerAcces } from "./garde";

/**
 * Garde des pages et actions serveur : retourne l'adulte connecté, le dépôt et la famille (déjà lue),
 * ou redirige vers /connexion (sans toucher à la base) ou /non-configure.
 */
export async function exigerAdulte(
  date: string,
  adulteParam?: string,
): Promise<{ adulteId: string; demo: boolean; depot: DepotFamille; famille: Famille }> {
  const jeton = (await cookies()).get(NOM_COOKIE_SESSION)?.value;
  const r = await controlerAcces({ env: process.env, date, jeton, adulteParam }).catch((e: unknown) => {
    if (e instanceof ErreurNonConfigure) redirect("/non-configure");
    throw e;
  });
  if (!r.ok) redirect(r.redirection);
  return r;
}
