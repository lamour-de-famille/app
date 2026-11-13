export type Identite = { email: string; nom: string };

/** Échange un code d'autorisation contre une identité. Derrière une interface pour pouvoir tester sans réseau. */
export interface FournisseurIdentite {
  urlAutorisation(state: string, redirectUri: string): string;
  echangerCode(code: string, redirectUri: string): Promise<Identite>;
}

/** Doublure de test : le code `code-<email>` donne l'identité correspondante ; tout autre code est refusé. */
export class FournisseurIdentiteFactice implements FournisseurIdentite {
  constructor(private readonly noms: Record<string, string> = {}) {}

  urlAutorisation(state: string, redirectUri: string): string {
    const u = new URL("https://fournisseur-factice.exemple.invalid/autoriser");
    u.searchParams.set("state", state);
    u.searchParams.set("redirect_uri", redirectUri);
    return u.toString();
  }

  async echangerCode(code: string): Promise<Identite> {
    if (!code.startsWith("code-")) throw new Error("Code invalide");
    const email = code.slice("code-".length);
    return { email, nom: this.noms[email] ?? email };
  }
}

/** Implémentation Google (OIDC). Jamais exécutée en test : aucun appel réel. */
export class FournisseurIdentiteGoogle implements FournisseurIdentite {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly appelReseau: typeof fetch = fetch,
    private readonly maintenant: () => number = Date.now,
  ) {}

  urlAutorisation(state: string, redirectUri: string): string {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", this.clientId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", "openid email profile");
    u.searchParams.set("state", state);
    return u.toString();
  }

  async echangerCode(code: string, redirectUri: string): Promise<Identite> {
    const reponse = await this.appelReseau("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!reponse.ok) throw new Error("Échange du code refusé");
    const { id_token } = (await reponse.json()) as { id_token?: string };
    // Jeton reçu directement de Google en TLS : on contrôle son contenu sans revérifier la signature.
    const morceaux = (id_token ?? "").split(".");
    if (morceaux.length !== 3) throw new Error("Jeton d'identité absent ou mal formé");
    const charge = JSON.parse(Buffer.from(morceaux[1]!, "base64url").toString("utf8")) as {
      aud?: string;
      iss?: string;
      exp?: number;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    const issuerOk = charge.iss === "https://accounts.google.com" || charge.iss === "accounts.google.com";
    const expOk = typeof charge.exp === "number" && charge.exp * 1000 > this.maintenant();
    if (!issuerOk || !expOk || charge.aud !== this.clientId || !charge.email || charge.email_verified !== true) {
      throw new Error("Jeton d'identité invalide");
    }
    return { email: charge.email, nom: charge.name ?? charge.email };
  }
}

/** Fournisseur réel construit depuis l'environnement ; lève une erreur si la configuration manque. */
export function fournisseurDepuisEnv(env: NodeJS.ProcessEnv = process.env): FournisseurIdentite {
  const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = env;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET non configurés");
  return new FournisseurIdentiteGoogle(id, secret);
}
