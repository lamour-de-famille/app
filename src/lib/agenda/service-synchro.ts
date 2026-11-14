import { modeDemoActif, type Env } from "../acces/acces";
import { ErreurNonConfigure, banqueUnique, obtenirDepot } from "../acces/depot";
import { StockageEtatFirestore } from "../firestore/etat-synchro-firestore";
import type { DependancesSynchro, FabriqueClients } from "./declenchement";
import { FUSEAU, StockageEtatMemoire, type EtatSynchro, type StockageEtatSynchro } from "./types";

/** Aujourd'hui, sans jeton stocké : chaque adulte est « a_reconnecter ». À brancher sur les jetons plus tard. */
export const fabriqueClientsParDefaut: FabriqueClients = async () => ({});

/** Jour civil (AAAA-MM-JJ) à Paris, comme le reste de l'application (jamais le jour UTC). */
export function jourParis(maintenant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
}

const CLE = Symbol.for("lamour.stockage-synchro");
type Global = { [CLE]?: StockageEtatSynchro };

function stockageMemoirePartage(): StockageEtatSynchro {
  const g = globalThis as unknown as Global;
  return (g[CLE] ??= new StockageEtatMemoire());
}

/** Stockage Firestore ouvert à la première utilisation (la banque s'ouvre de façon asynchrone). */
function stockageFirestorePareseux(env: Env): StockageEtatSynchro {
  let ouvert: Promise<StockageEtatSynchro> | null = null;
  const obtenir = () =>
    (ouvert ??= (async () => {
      const familleId = env.FAMILLE_ID?.trim();
      const projectId = env.FIRESTORE_PROJECT_ID?.trim();
      if (!familleId || !projectId) throw new ErreurNonConfigure("Application non configurée : FAMILLE_ID ou FIRESTORE_PROJECT_ID manquant.");
      return new StockageEtatFirestore(await banqueUnique(projectId), familleId);
    })());
  return {
    lire: async (adulteId: string) => (await obtenir()).lire(adulteId),
    ecrire: async (etat: EtatSynchro) => (await obtenir()).ecrire(etat),
  };
}

/** Dépendances de production : dépôt par le point unique d'accès, état en Firestore (mémoire en démonstration). */
export function dependancesParDefaut(env: Env = process.env, maintenant: () => Date = () => new Date()): DependancesSynchro {
  return {
    depot: () => obtenirDepot(jourParis(maintenant()), env),
    clients: fabriqueClientsParDefaut,
    stockage: modeDemoActif(env) ? stockageMemoirePartage() : stockageFirestorePareseux(env),
  };
}
