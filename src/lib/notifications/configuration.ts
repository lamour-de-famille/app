/** Seul endroit des valeurs par défaut des notifications. */
export const MAX_NOTIFICATIONS_PAR_JOUR_DEFAUT = 10;

export interface ConfigurationNotifications {
  maxParJour: number;
}

/** NOTIFICATIONS_MAX_PAR_JOUR : entier > 0, sinon 10. Lue par le serveur, jamais fournie par un appelant. */
export function configurationNotificationsDepuisEnv(env: Record<string, string | undefined> = process.env): ConfigurationNotifications {
  const v = env.NOTIFICATIONS_MAX_PAR_JOUR?.trim();
  const n = v ? Number(v) : NaN;
  return { maxParJour: Number.isInteger(n) && n > 0 ? n : MAX_NOTIFICATIONS_PAR_JOUR_DEFAUT };
}

/** Heure (Europe/Paris) du récapitulatif du lendemain quand l'adulte n'a rien réglé. */
export const HEURE_RECAPITULATIF_DEFAUT = "20:00";

/** Au plus un récapitulatif par jour et par destinataire : valeur du serveur, jamais fournie par un appelant. */
export const MAX_RECAPITULATIFS_PAR_JOUR = 1;

const RE_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const heureValide = (v: unknown): v is string => typeof v === "string" && RE_HEURE.test(v);

export interface ConfigurationRecapitulatif {
  heureParDefaut: string;
}

/** NOTIFICATIONS_HEURE_RECAP : HH:MM, sinon 20:00. */
export function configurationRecapitulatifDepuisEnv(env: Record<string, string | undefined> = process.env): ConfigurationRecapitulatif {
  const v = env.NOTIFICATIONS_HEURE_RECAP?.trim();
  return { heureParDefaut: heureValide(v) ? v : HEURE_RECAPITULATIF_DEFAUT };
}
