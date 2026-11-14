import type { DepotFamille } from "@/lib/domaine/depot";
import type { Famille } from "@/lib/domaine/types";
import type { Banque } from "@/lib/firestore/banque";
import { modeDemoActif, resoudreAcces, sessionAutorisee, type Env } from "./acces";
import { obtenirDepotEtFamille } from "./depot";

export type ResultatGarde =
  | { ok: true; adulteId: string; demo: boolean; depot: DepotFamille; famille: Famille }
  | { ok: false; redirection: "/connexion" | "/connexion?erreur=adulte-absent" };

/**
 * Garde complète, sans dépendance à Next. Hors démonstration, le jeton de session et ALLOWED_EMAILS
 * sont vérifiés d'abord (pur, sans coût) : sans session valide, la base n'est ni ouverte ni lue.
 * Ensuite seulement le dépôt est ouvert et la famille lue une fois ; les deux sont rendus à l'appelant.
 * Lève `ErreurNonConfigure` si la configuration ou la famille manque.
 */
export async function controlerAcces(p: {
  env: Env;
  date: string;
  jeton?: string;
  adulteParam?: string;
  banque?: Banque;
}): Promise<ResultatGarde> {
  if (!modeDemoActif(p.env) && !sessionAutorisee(p.env, p.jeton)) return { ok: false, redirection: "/connexion" };
  const { depot, famille } = await obtenirDepotEtFamille(p.date, p.env, p.banque);
  const acces = resoudreAcces({ env: p.env, famille, jeton: p.jeton, adulteParam: p.adulteParam });
  return acces.ok ? { ok: true, adulteId: acces.adulteId, demo: acces.demo, depot, famille } : acces;
}
