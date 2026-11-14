import { randomBytes } from "node:crypto";
import { ErreurDomaine } from "../domaine/depot";
import type { NoteDictee } from "../ia/types";
import type { NoteFamille, NotesFamille } from "../dictee/notes";
import { idDocumentValide, nettoyer, type Banque, type Donnees } from "./banque";

/**
 * Notes libres de la famille sous `familles/{familleId}/notes/{id}`. Les ids sont triables par date de
 * création (puis par compteur du processus) : `lister` rend les notes dans l'ordre d'ajout.
 */
export class NotesFamilleFirestore implements NotesFamille {
  private readonly collection: string;
  private n = 0;

  constructor(
    private readonly banque: Banque,
    familleId: string,
    private readonly maintenant: () => Date = () => new Date(),
  ) {
    if (!idDocumentValide(familleId)) throw new ErreurDomaine(`Identifiant de famille invalide : ${familleId}`);
    this.collection = `familles/${familleId}/notes`;
  }

  async ajouter(auteurId: string, note: NoteDictee): Promise<{ id: string }> {
    const date = this.maintenant();
    const rang = (this.n++ % 1679616).toString(36).padStart(4, "0");
    const id = `${date.getTime().toString(36).padStart(9, "0")}-${rang}-${randomBytes(4).toString("hex")}`;
    const doc: NoteFamille = { ...nettoyer(note), id, auteurId, creeLe: date.toISOString() };
    await this.banque.transaction(async (tx) => tx.ecrire(this.collection, id, doc as unknown as Donnees));
    return { id };
  }

  async lister(): Promise<NoteFamille[]> {
    const docs = await this.banque.transaction((tx) => tx.lister(this.collection), { lectureSeule: true });
    return docs.map((d) => d.donnees as unknown as NoteFamille);
  }
}
