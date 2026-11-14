import { ErreurDomaine, type DepotFamille } from "@/lib/domaine/depot";
import type { DateJour, Famille } from "@/lib/domaine/types";
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

type Cache = Map<string, Promise<Banque>>;
const g = globalThis as { __banqueFirestore?: Cache };

/** Une seule banque (un seul client Firestore) par projet et par processus, partagée entre pages et actions. */
export function banqueUnique(projectId: string, ouvrir: (id: string) => Promise<Banque> = ouvrirBanqueFirestore): Promise<Banque> {
  const cache = (g.__banqueFirestore ??= new Map());
  let b = cache.get(projectId);
  if (!b) {
    b = ouvrir(projectId);
    b.catch(() => cache.delete(projectId));
    cache.set(projectId, b);
  }
  return b;
}

/** Pour les tests : oublie les banques ouvertes. */
export function reinitialiserBanqueUnique(): void {
  g.__banqueFirestore = new Map();
}

/**
 * Seul point de choix du dépôt de données.
 * - Mode démonstration (MODE_DEMO=1 hors production) : dépôt de démonstration.
 * - Sinon : `DepotFirestore` réel (FIRESTORE_PROJECT_ID, FAMILLE_ID). La famille est lue en base ;
 *   si la configuration manque ou si la famille n'existe pas, `ErreurNonConfigure`. Jamais de fixture.
 * `banque` permet d'injecter une doublure (tests) ; elle remplace seulement le client Firestore.
 */
export async function obtenirDepot(date: DateJour, env: Env = process.env, banque?: Banque): Promise<DepotFamille> {
  return (await obtenirDepotEtFamille(date, env, banque)).depot;
}

/** Comme `obtenirDepot`, en rendant aussi la famille lue pour la validation (une seule lecture). */
export async function obtenirDepotEtFamille(
  date: DateJour,
  env: Env = process.env,
  banque?: Banque,
): Promise<{ depot: DepotFamille; famille: Famille }> {
  if (modeDemoActif(env)) {
    const depot = await depotPartage(date);
    return { depot, famille: await depot.lireFamille() };
  }
  const familleId = env.FAMILLE_ID?.trim();
  if (!familleId) throw new ErreurNonConfigure("Application non configurée : FAMILLE_ID manquant.");
  const projectId = env.FIRESTORE_PROJECT_ID?.trim();
  if (!banque && !projectId) throw new ErreurNonConfigure("Application non configurée : FIRESTORE_PROJECT_ID manquant.");
  let depot: DepotFirestore;
  let famille: Famille;
  try {
    depot = new DepotFirestore(banque ?? (await banqueUnique(projectId!)), familleId);
    famille = await depot.lireFamille();
  } catch (e) {
    if (e instanceof ErreurDomaine) {
      throw new ErreurNonConfigure(
        `Application non configurée : famille « ${familleId} » introuvable ou invalide en base (voir npm run initialiser-famille).`,
      );
    }
    throw e;
  }
  return { depot, famille };
}
