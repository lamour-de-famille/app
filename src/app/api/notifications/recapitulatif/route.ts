import { traiterRecapitulatif } from "@/lib/notifications/acces-notifications";
import { recapitulatifParDefaut } from "@/lib/notifications/service-notifications";

export const dynamic = "force-dynamic";

/** Appelée toutes les 15 minutes par Cloud Scheduler (secret partagé) ou par un adulte connecté. */
export function POST(request: Request) {
  return traiterRecapitulatif(request, {
    secret: process.env.NOTIFICATIONS_SECRET,
    env: process.env,
    service: () => recapitulatifParDefaut(process.env),
  });
}
