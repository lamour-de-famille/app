import { demarrerConnexion } from "@/lib/auth/flux";
import { fournisseurDepuisEnv } from "@/lib/auth/identite";

export function GET(request: Request) {
  return demarrerConnexion(request, fournisseurDepuisEnv);
}
