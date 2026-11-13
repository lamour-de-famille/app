/** Contrats du client Gemini (seul fournisseur d'IA). */
import type { Famille } from "../domaine/types";

export interface UsageIA {
  jetonsEntree: number;
  /** Jetons de sortie, réflexion comprise (facturés au tarif de sortie). */
  jetonsSortie: number;
}

export type Recurrence = "quotidienne" | "hebdomadaire" | "mensuelle" | "annuelle";

export interface TacheDictee {
  titre: string;
  assigneId?: string;
  /** AAAA-MM-JJ */
  echeance?: string;
  enfantId?: string;
  recurrence?: Recurrence;
}

export interface RendezVousDictee {
  titre: string;
  /** AAAA-MM-JJTHH:MM (heure locale, Europe/Paris). */
  debut: string;
  fin?: string;
  lieu?: string;
  enfantIds?: string[];
}

export interface NoteDictee {
  texte: string;
  enfantId?: string;
}

export interface SortieDictee {
  transcription: string;
  taches: TacheDictee[];
  rendezVous: RendezVousDictee[];
  notes: NoteDictee[];
}

export interface DemandeDictee {
  audio: { octets: Uint8Array; mimeType: string };
  /** Famille lue en base par l'appelant : le client en tire le contexte et vérifie les identifiants de la sortie. */
  famille: Famille;
  maintenant: Date;
  adulteId: string;
}

export interface DemandeRedaction {
  consigne: string;
  contexte: string;
}

/** `usage` absent : le fournisseur ne l'a pas indiqué, l'estimation réservée est conservée. */
export interface ClientGemini {
  /**
   * Un seul appel : transcription, correction, rangement et rédaction.
   * La sortie rendue est toujours validée et vérifiée contre les identifiants de la famille ;
   * sinon lève SortieDicteeInvalide (réponse reçue donc facturée : l'erreur porte l'usage).
   */
  traiterDictee(demande: DemandeDictee): Promise<{ resultat: SortieDictee; usage?: UsageIA }>;
  /** Texte court (notifications). */
  rediger(demande: DemandeRedaction): Promise<{ texte: string; usage?: UsageIA }>;
}
