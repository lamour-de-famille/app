/**
 * Étape de mise en production : crée la famille en base (ADR 0010).
 * FIRESTORE_PROJECT_ID, FAMILLE_ID, FAMILLE_JSON (chemin d'un fichier non versionné).
 */
import { ouvrirBanqueFirestore } from "../src/lib/firestore/banque-firestore";
import { amorcerFamille } from "../src/lib/firestore/amorcage";

async function main() {
  if (!process.env.FIRESTORE_PROJECT_ID) throw new Error("FIRESTORE_PROJECT_ID manquant.");
  const id = await amorcerFamille(await ouvrirBanqueFirestore(), process.env);
  console.log(`Famille « ${id} » créée.`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
