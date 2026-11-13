/**
 * Règles de planning : des données sérialisables (JSON), stockées via DepotFamille.
 * Aucune valeur (jour, heure, parité, découpage, adulte) n'est codée dans le moteur.
 */
import type { DateJour, Heure } from "../domaine/types";

/** 1 = lundi … 7 = dimanche (numérotation ISO 8601). */
export type JourIso = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Parite = "paire" | "impaire";

export interface InstantHebdo {
  jour: JourIso;
  heure: Heure;
}

interface RegleBase {
  id: string;
  libelle: string;
  /** Une règle inactive est conservée mais ignorée. */
  actif: boolean;
  /** Plus grand = prioritaire en cas de chevauchement pour un même enfant (égalité : ordre des ids). */
  priorite: number;
  /** Lieu des remises ; à défaut, le domicile de l'adulte qui reçoit. */
  lieuTransfertId?: string;
}

/** Week-ends : la semaine ISO du jour de début doit avoir la parité demandée. */
export interface RegleWeekEnd extends RegleBase {
  type: "week_end";
  parite: Parite;
  responsableId: string;
  enfantIds: string[];
  debut: InstantHebdo;
  /** Première occurrence de ce jour/heure strictement après le début. */
  fin: InstantHebdo;
}

export type DepartDecompte = "jour_officiel" | "lendemain";

/** Découpage d'une période de vacances en `parts` blocs consécutifs, attribués selon la parité de l'année. */
export interface RegleVacances extends RegleBase {
  type: "vacances";
  /** Sous-chaîne du nom de la période (insensible à la casse et aux accents). */
  nomContient: string;
  /** Si présent, seule la zone correspondante est retenue. */
  zone?: string;
  parts: number;
  /** Responsable de chaque bloc, dans l'ordre (longueur = parts), selon la parité de l'année. */
  attributions: Record<Parite, string[]>;
  enfantIds: string[];
  departDecompte: DepartDecompte;
  /** Heure des changements de bloc. */
  heureChangement: Heure;
  anneeReference: "debut" | "fin";
}

/** Les enfants `enfantIds` suivent `suitAdulteId` sur les créneaux de la règle source où il est responsable. */
export interface RegleDerivee extends RegleBase {
  type: "derivee";
  sourceId: string;
  suitAdulteId: string;
  enfantIds: string[];
}

export type Regle = RegleWeekEnd | RegleVacances | RegleDerivee;

/** Période de vacances scolaires (entrée du moteur). `fin` est le dernier jour inclus. */
export interface PeriodeVacances {
  nom: string;
  debut: DateJour;
  fin: DateJour;
  zone: string;
}

/** Plage continue de responsabilité d'un adulte sur des enfants, issue d'une règle. */
export interface Segment {
  regleId: string;
  libelle: string;
  enfantIds: string[];
  responsableId: string;
  debut: { date: DateJour; heure: Heure };
  fin: { date: DateJour; heure: Heure };
  /** Dates dont la nuit se passe chez le responsable. */
  nuits: DateJour[];
  /** Remise à l'arrivée / au départ du bloc (faux si le bloc voisin a le même responsable). */
  prise: boolean;
  remise: boolean;
  lieuTransfertId?: string;
}
