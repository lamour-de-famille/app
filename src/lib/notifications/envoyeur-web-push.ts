import { sendNotification } from "web-push";
import { AbonnementExpire, type AbonnementPush, type ContenuPush, type EnvoyeurPush } from "./types";

export interface ConfigurationVapid {
  sujet: string;
  clePublique: string;
  clePrivee: string;
}

/** Lit VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY ; null si l'une manque (push désactivé). */
export function configurationVapidDepuisEnv(env: Record<string, string | undefined> = process.env): ConfigurationVapid | null {
  const sujet = env.VAPID_SUBJECT?.trim();
  const clePublique = env.VAPID_PUBLIC_KEY?.trim();
  const clePrivee = env.VAPID_PRIVATE_KEY?.trim();
  return sujet && clePublique && clePrivee ? { sujet, clePublique, clePrivee } : null;
}

/** Envoyeur réel (bibliothèque web-push). Jamais exécuté en test : voir EnvoyeurPushFactice. */
export class EnvoyeurPushWebPush implements EnvoyeurPush {
  constructor(private readonly config: ConfigurationVapid) {}

  async envoyer(abonnement: AbonnementPush, contenu: ContenuPush) {
    try {
      await sendNotification(abonnement, JSON.stringify(contenu), {
        vapidDetails: { subject: this.config.sujet, publicKey: this.config.clePublique, privateKey: this.config.clePrivee },
        TTL: 60 * 60 * 12,
        timeout: 15_000,
      });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) throw new AbonnementExpire(abonnement.endpoint);
      throw e;
    }
  }
}
