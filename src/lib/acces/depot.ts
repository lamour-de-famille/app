import { ErreurDomaine, type DepotFamille } from "@/lib/domaine/depot";
import type { DateJour } from "@/lib/domaine/types";
import type { Banque } from "@/lib/firestore/banque";
import { ouvrirBanqueFirestore } from "@/lib/firestore/banque-firestore";
import { DepotFirestore } from "@/lib/firestore/depot-firestore";
import { depotPartage } from "@/lib/vues/chargeur-planning";
import { modeDemoActif, type Env } from "./acces";

/** Configuration de production absente ou famille introuvable en base : aucune donnée de repli. */
export class ErreurNonConfigure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurNonConfigure";
  }
}

/**
 * Seul point de choix du dépôt de données.
 * - Mode démonstration (MODE_DEMO=1 hors production) : dépôt de démonstration.
 * - Sinon : `DepotFirestore` réel (FIRESTORE_PROJECT_ID, FAMILLE_ID). La famille est lue en base ;
 *   si la configuration manque ou si la famille n'existe pas, `ErreurNonConfigure`. Jamais de fixture.
 * `banque` permet d'injecter une doublure (tests) ; elle remplace seulement le client Firestore.
 */
export async function obtenirDepot(date: DateJour, env: Env = process.env, banque?: Banque): Promise<DepotFamille> {
  if (modeDemoActif(env)) return depotPartage(date);
  const familleId = env.FAMILLE_ID?.trim();
  if (!familleId) throw new ErreurNonConfigure("Application non configurée : FAMILLE_ID manquant.");
  const projectId = env.FIRESTORE_PROJECT_ID?.trim();
  if (!banque && !projectId) throw new ErreurNonConfigure("Application non configurée : FIRESTORE_PROJECT_ID manquant.");
  let depot: DepotFirestore;
  try {
    depot = new DepotFirestore(banque ?? (await ouvrirBanqueFirestore(projectId)), familleId);
    await depot.lireFamille();
  } catch (e) {
    if (e instanceof ErreurDomaine) {
      throw new ErreurNonConfigure(
        `Application non configurée : famille « ${familleId} » introuvable ou invalide en base (voir npm run initialiser-famille).`,
      );
    }
    throw e;
  }
  return depot;
}
