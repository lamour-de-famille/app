/** Types du coeur de domaine. Aucune valeur de règle n'est codée ici. */

/** Date au format AAAA-MM-JJ. */
export type DateJour = string;
/** Heure réglée au format HH:MM. */
export type Heure = string;

export type RoleAdulte = "parent" | "beau-parent";

export interface Adulte {
  id: string;
  prenom: string;
  role: RoleAdulte;
}

export interface Enfant {
  id: string;
  prenom: string;
  /** Couleur configurable, hexadécimale (#RRGGBB). */
  couleur: string;
}

/** `domicile_a` et `domicile_b` désignent les domiciles des deux adultes de la famille. */
export type TypeLieu = "ecole" | "domicile_a" | "domicile_b" | "autre";

export interface Lieu {
  id: string;
  type: TypeLieu;
  libelle: string;
}

/** Une famille compte exactement deux adultes : le premier est « A », le second « B ». */
export interface Famille {
  id: string;
  nom: string;
  adultes: [Adulte, Adulte];
  enfants: Enfant[];
  lieux: Lieu[];
}

/** Qui est responsable de l'enfant ce jour-là (indépendant de l'endroit où il dort). */
export interface Garde {
  enfantId: string;
  date: DateJour;
  responsableId: string;
  /** « regle » : écrite par le moteur (retirée si la règle ne la veut plus) ; absent : saisie à la main. */
  origine?: "regle";
}

/** Où l'enfant dort ce soir-là (indépendant de qui est responsable). */
export interface Presence {
  enfantId: string;
  date: DateJour;
  lieuId: string;
  /** « regle » : écrite par le moteur (retirée si la règle ne la veut plus) ; absent : saisie à la main. */
  origine?: "regle";
}

export interface Transfert {
  id: string;
  date: DateJour;
  heure: Heure;
  lieuId: string;
  deposeId: string;
  recupereId: string;
  enfantIds: string[];
}

/** Marque d'origine d'un créneau issu d'une règle (le moteur vient plus tard). */
export interface OrigineRegle {
  type: "regle";
  regleId: string;
  /** Écart par rapport à la règle, en texte libre (ex. « décalé d'un jour »). */
  ecart?: string;
}

export interface Creneau {
  id: string;
  enfantId: string;
  date: DateJour;
  debut: Heure;
  fin: Heure;
  libelle: string;
  origine?: OrigineRegle;
}

export type StatutDemande = "proposee" | "acceptee" | "refusee";

/**
 * L'auteur demande que `responsableId` (un adulte de la famille) ait la garde
 * des enfants concernés, et qu'ils dorment à son domicile, les jours indiqués.
 * Seul l'autre adulte (différent de l'auteur) peut répondre.
 */
export interface DemandeEchange {
  id: string;
  statut: StatutDemande;
  auteurId: string;
  responsableId: string;
  enfantIds: string[];
  jours: DateJour[];
  creeLe: string;
  reponduLe?: string;
  repondeurId?: string;
}

export type EntiteJournal = "garde" | "presence" | "transfert" | "creneau" | "demande" | "regle";
export type ActionJournal = "creation" | "modification" | "suppression";

export interface EntreeJournal {
  id: string;
  auteurId: string;
  /** Horodatage ISO 8601. */
  quand: string;
  entite: EntiteJournal;
  /** Clé de l'objet modifié (id ou « enfant|date »). */
  cle: string;
  action: ActionJournal;
  avant: unknown;
  apres: unknown;
}

/** Événement destiné à l'autre adulte ; l'envoi réel n'est pas géré ici. */
export interface EvenementANotifier {
  id: string;
  entreeId: string;
  destinataireId: string;
  quand: string;
}
