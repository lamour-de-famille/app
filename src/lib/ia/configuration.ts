/** Configuration IA : seul fichier portant les valeurs par défaut (modèle et seuils). */

export const MODELE_PAR_DEFAUT = "gemini-2.5-pro";

/**
 * Les jetons d'entrée et de sortie (réflexion comprise) sont plafonnés séparément :
 * la sortie est facturée bien plus cher (voir ADR 0012 pour le calcul du budget).
 */
export interface SeuilsIA {
  maxRequetesJour: number;
  maxJetonsEntreeJour: number;
  maxJetonsSortieJour: number;
  maxRequetesMois: number;
  maxJetonsEntreeMois: number;
  maxJetonsSortieMois: number;
  /** Jetons d'entrée réservés avant un appel (estimation prudente), remplacés par l'usage réel ensuite. */
  jetonsEntreeReservesParAppel: number;
  /** Jetons de sortie (réflexion comprise) réservés avant un appel. */
  jetonsSortieReservesParAppel: number;
}

/** Bornes d'un appel : la taille de la réponse (réflexion comprise) et la réflexion sont limitées, donc le coût aussi. */
export interface LimitesAppel {
  /** Jetons de sortie maximaux, réflexion comprise (alignés sur la réservation du plafond). */
  maxOutputTokens: number;
  /** Jetons de réflexion maximaux. */
  thinkingBudget: number;
}

export const LIMITES_DICTEE: LimitesAppel = { maxOutputTokens: 4_000, thinkingBudget: 1_024 };
export const LIMITES_REDACTION: LimitesAppel = { maxOutputTokens: 2_048, thinkingBudget: 512 };

/** Taille maximale de l'audio d'une dictée (octets) : environ quelques minutes d'audio compressé. */
export const MAX_OCTETS_AUDIO_PAR_DEFAUT = 5 * 1024 * 1024;

export interface ConfigurationIA {
  modele: string;
  seuils: SeuilsIA;
  maxOctetsAudio: number;
}

export const SEUILS_PAR_DEFAUT: SeuilsIA = {
  maxRequetesJour: 30,
  maxJetonsEntreeJour: 100_000,
  maxJetonsSortieJour: 20_000,
  maxRequetesMois: 400,
  maxJetonsEntreeMois: 1_000_000,
  maxJetonsSortieMois: 200_000,
  jetonsEntreeReservesParAppel: 5_000,
  jetonsSortieReservesParAppel: 4_000,
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
    maxOctetsAudio: entierPositif(env.IA_MAX_OCTETS_AUDIO, MAX_OCTETS_AUDIO_PAR_DEFAUT),
    seuils: {
      maxRequetesJour: entierPositif(env.IA_MAX_REQUETES_JOUR, d.maxRequetesJour),
      maxJetonsEntreeJour: entierPositif(env.IA_MAX_JETONS_ENTREE_JOUR, d.maxJetonsEntreeJour),
      maxJetonsSortieJour: entierPositif(env.IA_MAX_JETONS_SORTIE_JOUR, d.maxJetonsSortieJour),
      maxRequetesMois: entierPositif(env.IA_MAX_REQUETES_MOIS, d.maxRequetesMois),
      maxJetonsEntreeMois: entierPositif(env.IA_MAX_JETONS_ENTREE_MOIS, d.maxJetonsEntreeMois),
      maxJetonsSortieMois: entierPositif(env.IA_MAX_JETONS_SORTIE_MOIS, d.maxJetonsSortieMois),
      jetonsEntreeReservesParAppel: d.jetonsEntreeReservesParAppel,
      jetonsSortieReservesParAppel: d.jetonsSortieReservesParAppel,
    },
  };
}
