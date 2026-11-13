/** Configuration IA : seul fichier portant les valeurs par défaut (modèle et seuils). */

export const MODELE_PAR_DEFAUT = "gemini-2.5-pro";

export interface SeuilsIA {
  maxRequetesJour: number;
  maxJetonsJour: number;
  maxRequetesMois: number;
  maxJetonsMois: number;
  /** Jetons réservés avant un appel (estimation prudente), remplacés par l'usage réel ensuite. */
  jetonsReservesParAppel: number;
}

export interface ConfigurationIA {
  modele: string;
  seuils: SeuilsIA;
}

export const SEUILS_PAR_DEFAUT: SeuilsIA = {
  maxRequetesJour: 30,
  maxJetonsJour: 300_000,
  maxRequetesMois: 400,
  maxJetonsMois: 3_000_000,
  jetonsReservesParAppel: 20_000,
};

function entierPositif(valeur: string | undefined, defaut: number): number {
  const v = valeur?.trim();
  if (!v) return defaut;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : defaut;
}

/** Lit GEMINI_MODEL et IA_MAX_*. Valeur vide ou invalide : défaut. La clé API n'est jamais lue ici. */
export function configurationIADepuisEnv(env: Record<string, string | undefined> = process.env): ConfigurationIA {
  const d = SEUILS_PAR_DEFAUT;
  return {
    modele: env.GEMINI_MODEL?.trim() || MODELE_PAR_DEFAUT,
    seuils: {
      maxRequetesJour: entierPositif(env.IA_MAX_REQUETES_JOUR, d.maxRequetesJour),
      maxJetonsJour: entierPositif(env.IA_MAX_JETONS_JOUR, d.maxJetonsJour),
      maxRequetesMois: entierPositif(env.IA_MAX_REQUETES_MOIS, d.maxRequetesMois),
      maxJetonsMois: entierPositif(env.IA_MAX_JETONS_MOIS, d.maxJetonsMois),
      jetonsReservesParAppel: d.jetonsReservesParAppel,
    },
  };
}
