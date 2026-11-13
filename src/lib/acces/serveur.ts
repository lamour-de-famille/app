import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NOM_COOKIE_SESSION } from "@/lib/auth/session";
import { resoudreAcces } from "./acces";
import { obtenirDepot } from "./depot";

/** Garde des pages et actions serveur : retourne l'adulte connecté ou redirige vers /connexion. */
export async function exigerAdulte(date: string, adulteParam?: string): Promise<{ adulteId: string; demo: boolean }> {
  const depot = await obtenirDepot(date);
  const jeton = (await cookies()).get(NOM_COOKIE_SESSION)?.value;
  const acces = resoudreAcces({ env: process.env, famille: await depot.lireFamille(), jeton, adulteParam });
  if (!acces.ok) redirect(acces.redirection);
  return { adulteId: acces.adulteId, demo: acces.demo };
}
