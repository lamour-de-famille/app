import { describe, expect, it } from "vitest";
import { MAX_PROPOSITIONS_EN_ATTENTE, type PropositionStockee, type StockagePropositions } from "./stockage-propositions";

const T0 = new Date("2026-11-14T10:00:00Z");
const QUINZE_MIN = 15 * 60 * 1000;

const proposition = (id: string, auteurId = "alex", expireLe = T0.getTime() + QUINZE_MIN): PropositionStockee => ({
  id,
  auteurId,
  expireLe,
  sortie: { transcription: `dictée ${id}`, taches: [{ titre: "Courses", assigneId: "sam" }], rendezVous: [], notes: [{ texte: "Pull bleu" }] },
  avertissements: ["un avertissement"],
});

/** Contrat de `StockagePropositions` ; `creer` reçoit l'horloge du stockage (utilisée pour purger à l'ajout). */
export function suiteStockagePropositions(creer: (maintenant: () => Date) => Promise<StockagePropositions>) {
  describe("contrat StockagePropositions", () => {
    it("rend la proposition à son auteur, à l'identique", async () => {
      const s = await creer(() => T0);
      await s.ajouter(proposition("p1"));
      expect(await s.prendre("p1", "alex", T0)).toEqual(proposition("p1"));
    });

    it("usage unique : une seconde prise ne rend rien", async () => {
      const s = await creer(() => T0);
      await s.ajouter(proposition("p1"));
      expect(await s.prendre("p1", "alex", T0)).not.toBeNull();
      expect(await s.prendre("p1", "alex", T0)).toBeNull();
    });

    it("usage unique ATOMIQUE : des prises simultanées n'en laissent passer qu'une", async () => {
      const s = await creer(() => T0);
      await s.ajouter(proposition("p1"));
      const resultats = await Promise.all(Array.from({ length: 8 }, () => s.prendre("p1", "alex", T0)));
      expect(resultats.filter((r) => r !== null)).toHaveLength(1);
    });

    it("inconnue : null", async () => {
      expect(await (await creer(() => T0)).prendre("absente", "alex", T0)).toBeNull();
    });

    it("un autre auteur (ou un intrus) ne l'obtient pas et ne la brûle pas", async () => {
      const s = await creer(() => T0);
      await s.ajouter(proposition("p1", "alex"));
      expect(await s.prendre("p1", "sam", T0)).toBeNull();
      expect(await s.prendre("p1", "intrus", T0)).toBeNull();
      expect(await s.prendre("p1", "alex", T0)).not.toBeNull();
    });

    it("expire au bout de 15 minutes : valable juste avant, refusée à l'instant limite", async () => {
      const s = await creer(() => T0);
      await s.ajouter(proposition("avant"));
      await s.ajouter(proposition("limite"));
      expect(await s.prendre("avant", "alex", new Date(T0.getTime() + QUINZE_MIN - 1))).not.toBeNull();
      expect(await s.prendre("limite", "alex", new Date(T0.getTime() + QUINZE_MIN))).toBeNull();
      // Expirée donc retirée : même plus tôt, elle ne revient pas.
      expect(await s.prendre("limite", "alex", T0)).toBeNull();
    });

    it("une proposition remise (choix invalide) peut être reprise", async () => {
      const s = await creer(() => T0);
      await s.ajouter(proposition("p1"));
      const prise = (await s.prendre("p1", "alex", T0))!;
      await s.ajouter(prise);
      expect(await s.prendre("p1", "alex", T0)).toEqual(prise);
    });

    it("isole la valeur stockée de la saisie", async () => {
      const s = await creer(() => T0);
      const p = proposition("p1");
      await s.ajouter(p);
      p.sortie.transcription = "modifiée après coup";
      expect((await s.prendre("p1", "alex", T0))?.sortie.transcription).toBe("dictée p1");
    });

    it("borne le nombre de propositions en attente : les plus anciennes sont écartées", async () => {
      const s = await creer(() => T0);
      for (let i = 0; i < MAX_PROPOSITIONS_EN_ATTENTE + 3; i++) await s.ajouter(proposition(`p${String(i).padStart(3, "0")}`, "alex", T0.getTime() + QUINZE_MIN + i));
      expect(await s.prendre("p000", "alex", T0)).toBeNull();
      expect(await s.prendre("p002", "alex", T0)).toBeNull();
      expect(await s.prendre("p003", "alex", T0)).not.toBeNull();
      expect(await s.prendre(`p${String(MAX_PROPOSITIONS_EN_ATTENTE + 2).padStart(3, "0")}`, "alex", T0)).not.toBeNull();
    });
  });
}
