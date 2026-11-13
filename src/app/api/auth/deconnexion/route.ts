import { NOM_COOKIE_SESSION, effacerCookie } from "@/lib/auth/session";

export function POST(request: Request) {
  return new Response(null, {
    status: 303,
    headers: { location: new URL("/connexion", request.url).toString(), "set-cookie": effacerCookie(NOM_COOKIE_SESSION) },
  });
}
