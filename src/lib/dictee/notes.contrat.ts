import { describe, expect, it } from "vitest";
import type { NotesFamille } from "./notes";

/** Contrat de `NotesFamille`, exécuté contre chaque implémentation (horloge injectée). */
export function suiteNotesFamille(creer: (maintenant: () => Date) => Promise<NotesFamille>) {
  describe("contrat NotesFamille", () => {
    const fixe = () => new Date("2026-11-14T10:00:00Z");

    it("est vide au départ", async () => {
      expect(await (await creer(fixe)).lister()).toEqual([]);
    });

    it("rend l'id, l'auteur et la date de création, dans l'ordre d'ajout", async () => {
      const n = await creer(fixe);
      const a = await n.ajouter("alex", { texte: "Pull bleu à rendre", enfantId: "mila" });
      const b = await n.ajouter("sam", { texte: "Piscine jeudi" });
      const c = await n.ajouter("alex", { texte: "Goûter" });
      expect(new Set([a.id, b.id, c.id]).size).toBe(3);
      expect(await n.lister()).toEqual([
        { id: a.id, auteurId: "alex", creeLe: "2026-11-14T10:00:00.000Z", texte: "Pull bleu à rendre", enfantId: "mila" },
        { id: b.id, auteurId: "sam", creeLe: "2026-11-14T10:00:00.000Z", texte: "Piscine jeudi" },
        { id: c.id, auteurId: "alex", creeLe: "2026-11-14T10:00:00.000Z", texte: "Goûter" },
      ]);
    });

    it("utilise l'horloge du dépôt pour chaque note", async () => {
      let t = new Date("2026-11-14T10:00:00Z");
      const n = await creer(() => t);
      await n.ajouter("alex", { texte: "a" });
      t = new Date("2026-11-15T07:00:00Z");
      await n.ajouter("alex", { texte: "b" });
      expect((await n.lister()).map((x) => x.creeLe)).toEqual(["2026-11-14T10:00:00.000Z", "2026-11-15T07:00:00.000Z"]);
    });

    it("isole la saisie et la valeur retournée", async () => {
      const n = await creer(fixe);
      const saisie = { texte: "original" };
      await n.ajouter("alex", saisie);
      saisie.texte = "modifié après coup";
      (await n.lister())[0]!.texte = "modifié dehors";
      expect((await n.lister())[0]!.texte).toBe("original");
    });
  });
}
