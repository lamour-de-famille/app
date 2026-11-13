/** Contrats du client Gemini (seul fournisseur d'IA). */

export interface UsageIA {
  jetonsEntree: number;
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
  /** Contexte familial lu en base par l'appelant (jamais écrit dans le code). */
  contexteFamilial: string;
  maintenant: Date;
  adulteId: string;
}

export interface DemandeRedaction {
  consigne: string;
  contexte: string;
}

export interface ClientGemini {
  /** Un seul appel : transcription, correction, rangement et rédaction. */
  traiterDictee(demande: DemandeDictee): Promise<{ resultat: SortieDictee; usage: UsageIA }>;
  /** Texte court (notifications). */
  rediger(demande: DemandeRedaction): Promise<{ texte: string; usage: UsageIA }>;
}
