import { heureValide } from "./configuration";

/** Préférences de récapitulatif d'un adulte. `heure` : HH:MM, fuseau Europe/Paris. */
export interface PreferencesRecapitulatif {
  actif: boolean;
  heure: string;
}

export class PreferencesInvalides extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreferencesInvalides";
  }
}

/** Validation stricte d'une saisie : deux champs exactement, aucun autre, types exacts, heure HH:MM de 00:00 à 23:59. */
export function validerPreferences(brut: unknown): PreferencesRecapitulatif {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) throw new PreferencesInvalides("Préférences : objet attendu.");
  const o = brut as Record<string, unknown>;
  for (const cle of Object.keys(o)) {
    if (cle !== "actif" && cle !== "heure") throw new PreferencesInvalides(`Préférences : champ inconnu « ${cle} ».`);
  }
  if (typeof o.actif !== "boolean") throw new PreferencesInvalides("Préférences : « actif » doit être un booléen.");
  if (!heureValide(o.heure)) throw new PreferencesInvalides("Préférences : « heure » doit être au format HH:MM.");
  return { actif: o.actif, heure: o.heure };
}

/** Une seule entrée par adulte ; absente = valeurs par défaut (actif, heure de la configuration). */
export interface StockagePreferences {
  lire(adulteId: string): Promise<PreferencesRecapitulatif | null>;
  /** Écrit des préférences déjà validées. */
  ecrire(adulteId: string, preferences: PreferencesRecapitulatif): Promise<void>;
}

export class StockagePreferencesMemoire implements StockagePreferences {
  private readonly donnees = new Map<string, PreferencesRecapitulatif>();
  async lire(adulteId: string) {
    const p = this.donnees.get(adulteId);
    return p ? { ...p } : null;
  }
  async ecrire(adulteId: string, preferences: PreferencesRecapitulatif) {
    this.donnees.set(adulteId, validerPreferences(preferences));
  }
}
