import { dependancesParDefaut } from "@/lib/dictee/composition";
import { traiterProposer } from "@/lib/dictee/routes";

export const dynamic = "force-dynamic";

/** Proposition de dictée (aucune écriture). Voir docs/adr/0016-dictee.md. */
export function POST(request: Request) {
  return traiterProposer(request, dependancesParDefaut());
}
