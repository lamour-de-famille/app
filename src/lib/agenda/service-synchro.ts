import { depotPartage } from "../vues/chargeur-planning";
import type { DependancesSynchro, FabriqueClients } from "./declenchement";
import { StockageEtatMemoire, type StockageEtatSynchro } from "./types";

/** Aujourd'hui, sans jeton stocké : chaque adulte est « a_reconnecter ». À brancher sur les jetons plus tard. */
export const fabriqueClientsParDefaut: FabriqueClients = async () => ({});

const CLE = Symbol.for("lamour.stockage-synchro");
type Global = { [CLE]?: StockageEtatSynchro };

function stockagePartage(): StockageEtatSynchro {
  const g = globalThis as unknown as Global;
  return (g[CLE] ??= new StockageEtatMemoire());
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** Dépendances de production (mémoire pour l'instant ; Firestore arrive par une autre PR). */
export function dependancesParDefaut(): DependancesSynchro {
  return { depot: () => depotPartage(aujourdhui()), clients: fabriqueClientsParDefaut, stockage: stockagePartage() };
}
