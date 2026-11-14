import { describe, expect, it } from "vitest";
import { ErreurDomaine } from "../domaine/depot";
import { familleFictive } from "../domaine/fixture-famille";
import { suiteNotesFamille } from "../dictee/notes.contrat";
import { NotesFamilleMemoire } from "../dictee/notes";
import { suiteStockagePropositions } from "../dictee/stockage-propositions.contrat";
import { StockagePropositionsMemoire } from "../dictee/stockage-propositions";
import { StockageUsageIAMemoire } from "../ia/plafond";
import { suiteStockageUsageIA } from "../ia/stockage-usage.contrat";
import { DepotTachesMemoire } from "../taches/depot-memoire";
import { suiteDepotTaches } from "../taches/depot-contrat";
import { BanqueMemoire } from "./banque-memoire";
import { DepotFirestore } from "./depot-firestore";
import { DepotTachesFirestore } from "./depot-taches-firestore";
import { NotesFamilleFirestore } from "./notes-firestore";
import { StockagePropositionsFirestore } from "./propositions-firestore";
import { StockageUsageIAFirestore } from "./usage-ia-firestore";

describe("version mémoire", () => {
  describe("DepotTachesMemoire", () => {
    suiteDepotTaches(async (famille, maintenant) => new DepotTachesMemoire(famille, { maintenant }));
  });
  describe("NotesFamilleMemoire", () => {
    suiteNotesFamille(async (maintenant) => new NotesFamilleMemoire(maintenant));
  });
  describe("StockagePropositionsMemoire", () => {
    suiteStockagePropositions(async () => new StockagePropositionsMemoire());
  });
  describe("StockageUsageIAMemoire", () => {
    suiteStockageUsageIA(async () => new StockageUsageIAMemoire());
  });
});

describe("version Firestore sur banque en mémoire", () => {
  let n = 0;
  const famille = () => `fam-lot2-${++n}`;
  const avecFamille = async (banque: BanqueMemoire) => {
    const id = famille();
    await new DepotFirestore(banque, id).initialiserFamille(familleFictive);
    return id;
  };

  describe("DepotTachesFirestore", () => {
    suiteDepotTaches(async (f, maintenant) => {
      const banque = new BanqueMemoire();
      const id = famille();
      await new DepotFirestore(banque, id).initialiserFamille(f);
      return new DepotTachesFirestore(banque, id, { maintenant });
    });
  });
  describe("NotesFamilleFirestore", () => {
    suiteNotesFamille(async (maintenant) => new NotesFamilleFirestore(new BanqueMemoire(), famille(), maintenant));
  });
  describe("StockagePropositionsFirestore", () => {
    suiteStockagePropositions(async (maintenant) => new StockagePropositionsFirestore(new BanqueMemoire(), famille(), maintenant));
  });
  describe("StockageUsageIAFirestore", () => {
    suiteStockageUsageIA(async () => new StockageUsageIAFirestore(new BanqueMemoire(), famille()));
  });

  describe("particularités Firestore", () => {
    it("les ids de tâches sont des UUID, non séquentiels (l'oracle des ids devinables est fermé)", async () => {
      const banque = new BanqueMemoire();
      const id = await avecFamille(banque);
      const d = new DepotTachesFirestore(banque, id);
      const a = await d.enregistrer("alex", { titre: "x", assigneId: "alex" });
      const b = await d.enregistrer("alex", { titre: "y", assigneId: "alex" });
      expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(a.id).not.toBe(b.id);
      for (const deviné of ["tache-1", "tache-2", "1"]) {
        await expect(d.supprimer("sam", deviné)).rejects.toThrow(/inconnue/);
      }
    });

    it("n'écrit que les différences : cocher une tâche ne touche qu'un document", async () => {
      const banque = new BanqueMemoire();
      const id = await avecFamille(banque);
      const d = new DepotTachesFirestore(banque, id);
      const a = await d.enregistrer("alex", { titre: "x", assigneId: "alex" });
      await d.enregistrer("alex", { titre: "y", assigneId: "alex" });
      const ecrits: string[] = [];
      const espion = {
        transaction: <T>(t: Parameters<BanqueMemoire["transaction"]>[0], o?: Parameters<BanqueMemoire["transaction"]>[1]) =>
          banque.transaction<T>(
            (tx) =>
              t({ ...tx, ecrire: (c, i, v) => (ecrits.push(`${c}/${i}`), tx.ecrire(c, i, v)) }) as Promise<T>,
            o,
          ),
      };
      await new DepotTachesFirestore(espion, id).cocher("alex", a.id);
      expect(ecrits).toEqual([`familles/${id}/taches/${a.id}`]);
    });

    it("séparé par famille : une autre famille ne voit ni ne touche ces tâches", async () => {
      const banque = new BanqueMemoire();
      const f1 = await avecFamille(banque);
      const f2 = await avecFamille(banque);
      const d1 = new DepotTachesFirestore(banque, f1);
      const d2 = new DepotTachesFirestore(banque, f2);
      const a = await d1.enregistrer("alex", { titre: "x", assigneId: "alex" });
      expect(await d2.lister()).toEqual([]);
      await expect(d2.cocher("alex", a.id)).rejects.toThrow(ErreurDomaine);
    });

    it("famille inexistante ou identifiant impropre : ErreurDomaine, rien n'est créé", async () => {
      const banque = new BanqueMemoire();
      await expect(new DepotTachesFirestore(banque, "absente").lister()).rejects.toThrow(/introuvable/);
      for (const id of ["", "a/b", "..", "__x__"]) {
        expect(() => new DepotTachesFirestore(banque, id)).toThrow(ErreurDomaine);
        expect(() => new NotesFamilleFirestore(banque, id)).toThrow(ErreurDomaine);
        expect(() => new StockagePropositionsFirestore(banque, id)).toThrow(ErreurDomaine);
        expect(() => new StockageUsageIAFirestore(banque, id)).toThrow(ErreurDomaine);
      }
      expect(banque.compter()).toBe(0);
    });

    it("le plafond IA tient entre deux instances qui partagent la base", async () => {
      const banque = new BanqueMemoire();
      const a = new StockageUsageIAFirestore(banque, "fam-plafond");
      const b = new StockageUsageIAFirestore(banque, "fam-plafond");
      await Promise.all([a.ajouter("jour:2026-11-14", { requetes: 1, jetonsEntree: 1, jetonsSortie: 1 }), b.ajouter("jour:2026-11-14", { requetes: 1, jetonsEntree: 1, jetonsSortie: 1 })]);
      expect((await a.lire("jour:2026-11-14")).requetes).toBe(2);
      await expect(a.lire("a/b")).rejects.toThrow();
    });

    it("deux instances : une proposition ne peut être prise qu'une fois", async () => {
      const banque = new BanqueMemoire();
      const a = new StockagePropositionsFirestore(banque, "fam-p");
      const b = new StockagePropositionsFirestore(banque, "fam-p");
      const t = new Date("2026-11-14T10:00:00Z");
      await a.ajouter({ id: "p1", auteurId: "alex", expireLe: t.getTime() + 1000, sortie: { transcription: "", taches: [], rendezVous: [], notes: [] }, avertissements: [] });
      const [x, y] = await Promise.all([a.prendre("p1", "alex", t), b.prendre("p1", "alex", t)]);
      expect([x, y].filter(Boolean)).toHaveLength(1);
    });
  });
});
