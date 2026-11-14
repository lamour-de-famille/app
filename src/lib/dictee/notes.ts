import type { NoteDictee } from "../ia/types";

export interface NoteFamille extends NoteDictee {
  id: string;
  auteurId: string;
  /** Horodatage ISO 8601. */
  creeLe: string;
}

/**
 * Notes libres de la famille (petit stockage derrière interface ; l'adaptateur Firestore viendra plus tard).
 * La lecture destinée à un écran reste à brancher avec l'écran de notes.
 */
export interface NotesFamille {
  ajouter(auteurId: string, note: NoteDictee): Promise<{ id: string }>;
  lister(): Promise<NoteFamille[]>;
}

export class NotesFamilleMemoire implements NotesFamille {
  private readonly notes: NoteFamille[] = [];
  constructor(private readonly maintenant: () => Date = () => new Date()) {}

  async ajouter(auteurId: string, note: NoteDictee) {
    const id = `note-${this.notes.length + 1}`;
    this.notes.push({ ...structuredClone(note), id, auteurId, creeLe: this.maintenant().toISOString() });
    return { id };
  }

  async lister() {
    return structuredClone(this.notes);
  }
}
