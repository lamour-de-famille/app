import type { DepotFamille } from "@/lib/domaine/depot";
import { DepotMemoire } from "@/lib/domaine/depot-memoire";
import { familleFictive } from "@/lib/domaine/fixture-famille";
import type { DateJour } from "@/lib/domaine/types";
import { depotPartage } from "@/lib/vues/chargeur-planning";
import { modeDemoActif, type Env } from "./acces";

const CLE = Symbol.for("lamour.depot-memoire-vide");
type Global = { [CLE]?: DepotFamille };

/**
 * Seul point de choix du dépôt de données. Aujourd'hui : doublure mémoire (vide hors démonstration).
 * L'adaptateur Firestore se branchera ici, et uniquement ici.
 */
export async function obtenirDepot(date: DateJour, env: Env = process.env): Promise<DepotFamille> {
  if (modeDemoActif(env)) return depotPartage(date);
  const g = globalThis as unknown as Global;
  return (g[CLE] ??= new DepotMemoire(familleFictive));
}
