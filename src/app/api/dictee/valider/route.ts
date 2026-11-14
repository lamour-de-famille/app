import { dependancesParDefaut } from "@/lib/dictee/composition";
import { traiterValider } from "@/lib/dictee/routes";

export const dynamic = "force-dynamic";

/** Validation explicite d'une proposition : seule route d'écriture de la dictée. */
export function POST(request: Request) {
  return traiterValider(request, dependancesParDefaut());
}
