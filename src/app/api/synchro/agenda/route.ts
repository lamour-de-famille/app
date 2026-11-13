import { traiterSynchro } from "@/lib/agenda/acces-synchro";
import { dependancesParDefaut } from "@/lib/agenda/service-synchro";

export const dynamic = "force-dynamic";

/** Appelée par Cloud Scheduler (secret partagé) ou par un adulte connecté. */
export function POST(request: Request) {
  return traiterSynchro(request, { secret: process.env.SYNCHRO_SECRET, ...dependancesParDefaut() });
}
