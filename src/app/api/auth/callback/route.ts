import { terminerConnexion } from "@/lib/auth/flux";
import { fournisseurDepuisEnv } from "@/lib/auth/identite";

export function GET(request: Request) {
  return terminerConnexion(request, fournisseurDepuisEnv);
}
