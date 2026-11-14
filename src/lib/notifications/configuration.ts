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
