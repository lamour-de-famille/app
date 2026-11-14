import { traiterAbonnement } from "@/lib/notifications/acces-notifications";
import { dependancesAbonnementParDefaut } from "@/lib/notifications/service-notifications";

export const dynamic = "force-dynamic";

/** Enregistre l'appareil de l'adulte connecté (session obligatoire). */
export function POST(request: Request) {
  return traiterAbonnement(request, dependancesAbonnementParDefaut());
}

/** Retire l'appareil de l'adulte connecté. */
export function DELETE(request: Request) {
  return traiterAbonnement(request, dependancesAbonnementParDefaut());
}
