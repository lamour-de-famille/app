import { readFileSync } from "node:fs";
import type { Famille } from "@/lib/domaine/types";
import type { Banque } from "./banque";
import { DepotFirestore } from "./depot-firestore";

type Env = Record<string, string | undefined>;

/**
 * Crée la famille en base à partir d'un fichier JSON (chemin dans FAMILLE_JSON, identifiant dans FAMILLE_ID).
 * Le fichier contient les vraies données de la famille : il n'est jamais versionné.
 * Refuse d'écraser une famille existante.
 */
export async function amorcerFamille(banque: Banque, env: Env): Promise<string> {
  const id = env.FAMILLE_ID?.trim();
  if (!id) throw new Error("FAMILLE_ID manquant (identifiant de la famille en base).");
  const chemin = env.FAMILLE_JSON?.trim();
  if (!chemin) throw new Error("FAMILLE_JSON manquant (chemin du fichier JSON de la famille).");
  let brut: string;
  try {
    brut = readFileSync(chemin, "utf8");
  } catch {
    throw new Error(`Impossible de lire le fichier : ${chemin}`);
  }
  let famille: Famille;
  try {
    famille = JSON.parse(brut) as Famille;
  } catch {
    throw new Error("Le fichier n'est pas un JSON valide.");
  }
  await new DepotFirestore(banque, id).initialiserFamille(famille);
  return id;
}
