import type { DateJour } from "../domaine/types";

/** Tâche voulue dans la liste Google Tasks d'un adulte. `cle` est la clé d'occurrence (`cleOccurrence`). */
export interface TacheSouhaitee {
  cle: string;
  titre: string;
  /** Texte visible par l'adulte (sans la marque technique, ajoutée à l'écriture). */
  notes?: string;
  /** Date seule : Google Tasks ignore l'heure d'une échéance. */
  echeance?: DateJour;
}

/** Tâche telle que Google Tasks la renvoie (la nôtre ou une tâche étrangère). `notes` est brut, marque comprise. */
export interface TacheGoogle {
  id: string;
  titre: string;
  notes: string;
  echeance?: DateJour;
  /** Cochée dans Google Tasks. */
  terminee: boolean;
}

/** Contenu écrit : `notes` contient déjà la marque (voir `marque.ts`). */
export type NouvelleTacheGoogle = Omit<TacheGoogle, "id" | "terminee">;

/**
 * Accès à une liste Google Tasks dédiée. Les implémentations réelles ne sont jamais appelées en test.
 * Toute méthode lève `ErreurAutorisationExpiree` (module agenda) si l'autorisation est expirée ou révoquée.
 */
export interface ClientTasks {
  /** Identifiant de la liste portant ce titre ; elle est créée si elle n'existe pas. */
  idListe(titre: string): Promise<string>;
  /** Toutes les tâches de la liste, cochées comprises. Le filtrage par marque se fait côté application. */
  lister(listeId: string): Promise<TacheGoogle[]>;
  creer(listeId: string, tache: NouvelleTacheGoogle): Promise<TacheGoogle>;
  /** Remplace titre, notes et échéance ; ne touche jamais à l'état coché. */
  mettreAJour(listeId: string, id: string, tache: NouvelleTacheGoogle): Promise<TacheGoogle>;
  supprimer(listeId: string, id: string): Promise<void>;
}

export const TITRE_LISTE_DEFAUT = "L'amour de famille";
