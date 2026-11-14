/** Contrats de la dictée : proposition (aucune écriture) puis validation explicite par l'auteur. */
import type { NoteDictee, RendezVousDictee, TacheDictee } from "../ia/types";

/** Ce que le serveur a produit, et seulement cela. Visible de son seul auteur. */
export interface PropositionDictee {
  /** Identifiant à usage unique, non devinable, lié à l'auteur. */
  id: string;
  transcription: string;
  taches: TacheDictee[];
  rendezVous: RendezVousDictee[];
  notes: NoteDictee[];
  /** Ce que l'écriture adaptera ou ignorera (texte français, sans donnée de l'autre adulte). */
  avertissements: string[];
  /** Horodatage ISO 8601. */
  expireLe: string;
}

/** Un élément retenu : son indice dans la proposition, ou une version modifiée par l'utilisateur (revalidée). */
export type Choix<T> = number | T;

export interface Retenus {
  taches?: Choix<TacheDictee>[];
  rendezVous?: Choix<RendezVousDictee>[];
  notes?: Choix<NoteDictee>[];
}

export interface ResultatValidation {
  taches: number;
  /** Créneaux écrits au planning (un par enfant et par rendez-vous). */
  creneaux: number;
  notes: number;
  /** Rendez-vous sans enfant : gardés comme notes, faute de créneau possible. */
  rendezVousEnNote: number;
  /** Vrai si l'autre adulte a été notifié (le plafond de 10 par jour reste dans le service de notifications). */
  notifie: boolean;
  avertissements: string[];
}

export type RaisonAudio = "vide" | "trop_gros" | "type";

export class AudioInvalide extends Error {
  constructor(
    public readonly raison: RaisonAudio,
    message: string,
  ) {
    super(message);
    this.name = "AudioInvalide";
  }
}

/** Inconnue, expirée, déjà validée ou d'un autre auteur : même réponse, aucune indication. */
export class PropositionIntrouvable extends Error {
  constructor() {
    super("Proposition introuvable, expirée ou déjà validée.");
    this.name = "PropositionIntrouvable";
  }
}

export class ChoixInvalide extends Error {
  constructor(public readonly problemes: string[]) {
    super(`Choix invalide : ${problemes.join(" ; ")}`);
    this.name = "ChoixInvalide";
  }
}
