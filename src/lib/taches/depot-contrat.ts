import { describe, expect, it } from "vitest";
import { ErreurDomaine } from "../domaine/depot";
import { familleFictive } from "../domaine/fixture-famille";
import type { Famille } from "../domaine/types";
import type { DepotTaches } from "./depot";

/** Horloge réglable : les suites avancent le temps sans dépendre de la date réelle. */
export interface HorlogeTest {
  maintenant: () => Date;
  regler(iso: string): void;
}

const horloge = (iso: string): HorlogeTest => {
  let t = new Date(iso);
  return { maintenant: () => new Date(t), regler: (v) => void (t = new Date(v)) };
};

const QUOTIDIENNE = { frequence: "quotidienne", intervalle: 1 } as const;

/**
 * Contrat de `DepotTaches`, exécuté contre chaque implémentation. Les ids sont opaques : on ne suppose
 * jamais leur forme (séquentielle en mémoire, UUID en Firestore), seulement ce que rendent les accusés.
 * Mercredi 2026-11-11 08:00 UTC au départ.
 */
export function suiteDepotTaches(creer: (famille: Famille, maintenant: () => Date) => Promise<DepotTaches>) {
  describe("contrat DepotTaches", () => {
    const monter = async () => {
      const h = horloge("2026-11-11T08:00:00Z");
      return { h, d: await creer(familleFictive, h.maintenant) };
    };
    const trouver = async (d: DepotTaches, id: string) => (await d.lister()).find((t) => t.id === id);

    it("crée une tâche ponctuelle : accusé réduit à l'id, valeurs initiales, ids distincts", async () => {
      const { d } = await monter();
      const a = await d.enregistrer("alex", { titre: "Courses", assigneId: "sam", echeance: "2026-11-12", enfantId: "mila" });
      const b = await d.enregistrer("alex", { titre: "Pharmacie", assigneId: "alex" });
      expect(Object.keys(a)).toEqual(["id"]);
      expect(a.id).not.toBe(b.id);
      expect(await trouver(d, a.id)).toEqual({
        id: a.id,
        titre: "Courses",
        assigneId: "sam",
        echeance: "2026-11-12",
        enfantId: "mila",
        statut: "a_faire",
        creeParId: "alex",
      });
      expect((await d.lister()).length).toBe(2);
    });

    it("refuse les saisies invalides sans rien écrire", async () => {
      const { d } = await monter();
      const mauvaises = [
        { auteur: "intrus", t: { titre: "x", assigneId: "alex" } },
        { auteur: "alex", t: { titre: "x", assigneId: "intrus" } },
        { auteur: "alex", t: { titre: "  ", assigneId: "alex" } },
        { auteur: "alex", t: { titre: "x", assigneId: "alex", enfantId: "intrus" } },
        { auteur: "alex", t: { titre: "x", assigneId: "alex", echeance: "2026-02-31" } },
        { auteur: "alex", t: { titre: "x", assigneId: "alex", recurrence: QUOTIDIENNE } },
        { auteur: "alex", t: { titre: "x", assigneId: "alex", echeance: "2026-11-12", recurrence: { ...QUOTIDIENNE, intervalle: 0 } } },
        { auteur: "alex", t: { titre: "x", assigneId: "alex", echeance: "2026-11-12", recurrence: { ...QUOTIDIENNE, fin: "2026-11-01" } } },
      ];
      for (const m of mauvaises) await expect(d.enregistrer(m.auteur, m.t)).rejects.toThrow(ErreurDomaine);
      expect(await d.lister()).toEqual([]);
    });

    it("ne retient que les champs saisis : statut, auteur et exceptions ne viennent pas de l'appelant", async () => {
      const { d } = await monter();
      const { id } = await d.enregistrer("alex", {
        titre: "x",
        assigneId: "alex",
        statut: "faite",
        creeParId: "sam",
        exceptions: [{ date: "2026-11-11", faiteLe: "2026-11-11T00:00:00Z" }],
      } as never);
      const t = await trouver(d, id);
      expect(t?.statut).toBe("a_faire");
      expect(t?.creeParId).toBe("alex");
      expect(t?.exceptions).toBeUndefined();
    });

    it("isole les valeurs retournées de l'état stocké", async () => {
      const { d } = await monter();
      const { id } = await d.enregistrer("alex", { titre: "x", assigneId: "alex" });
      const liste = await d.lister();
      liste[0]!.titre = "modifié dehors";
      expect((await trouver(d, id))?.titre).toBe("x");
    });

    it("modifie les champs saisis, retire les optionnels absents, garde le statut", async () => {
      const { d } = await monter();
      const { id } = await d.enregistrer("alex", { titre: "x", assigneId: "alex", echeance: "2026-11-12", enfantId: "leo" });
      await d.cocher("alex", id);
      await d.enregistrer("alex", { id, titre: "y", assigneId: "alex" });
      const t = await trouver(d, id);
      expect(t?.titre).toBe("y");
      expect(t?.echeance).toBeUndefined();
      expect(t?.enfantId).toBeUndefined();
      expect(t?.statut).toBe("faite");
      expect((await d.lister()).length).toBe(1);
    });

    it("coche et décoche une tâche ponctuelle avec l'horloge du dépôt", async () => {
      const { d, h } = await monter();
      const { id } = await d.enregistrer("alex", { titre: "x", assigneId: "alex", echeance: "2026-11-11" });
      expect(await d.cocher("alex", id)).toEqual({ id });
      expect(await trouver(d, id)).toMatchObject({ statut: "faite", faiteLe: "2026-11-11T08:00:00.000Z" });
      h.regler("2026-11-11T09:30:00Z");
      await d.cocher("alex", id);
      expect((await trouver(d, id))?.faiteLe).toBe("2026-11-11T09:30:00.000Z");
      await d.decocher("alex", id);
      const t = await trouver(d, id);
      expect(t?.statut).toBe("a_faire");
      expect(t?.faiteLe).toBeUndefined();
      await expect(d.cocher("alex", id, "2026-11-11")).rejects.toThrow(/ponctuelle/);
    });

    it("coche une occurrence d'une série, avec une clé stable, sans toucher aux autres", async () => {
      const { d } = await monter();
      const { id } = await d.enregistrer("alex", { titre: "série", assigneId: "alex", echeance: "2026-11-09", recurrence: QUOTIDIENNE });
      expect(await d.cocher("alex", id, "2026-11-11")).toEqual({ id, cle: `${id}@2026-11-11` });
      await d.cocher("alex", id, "2026-11-10");
      expect((await trouver(d, id))?.exceptions?.map((e) => e.date)).toEqual(["2026-11-10", "2026-11-11"]);
      await d.decocher("alex", id, "2026-11-10");
      expect((await trouver(d, id))?.exceptions?.map((e) => e.date)).toEqual(["2026-11-11"]);
      await expect(d.cocher("alex", id, "2026-11-08")).rejects.toThrow(/occurrence/);
      await expect(d.cocher("alex", id)).rejects.toThrow(/occurrence/);
      await expect(d.cocher("alex", id, "pas une date")).rejects.toThrow(/Date/);
    });

    it("écarte les exceptions qui ne correspondent plus à la série modifiée", async () => {
      const { d } = await monter();
      const { id } = await d.enregistrer("alex", { titre: "série", assigneId: "alex", echeance: "2026-11-09", recurrence: QUOTIDIENNE });
      await d.cocher("alex", id, "2026-11-11");
      await d.enregistrer("alex", { id, titre: "série", assigneId: "alex", echeance: "2026-11-09", recurrence: { ...QUOTIDIENNE, fin: "2026-11-10" } });
      expect((await trouver(d, id))?.exceptions).toEqual([]);
    });

    it("tâche inconnue ou auteur inconnu : refus, rien n'est écrit", async () => {
      const { d } = await monter();
      const { id } = await d.enregistrer("alex", { titre: "x", assigneId: "alex" });
      await expect(d.cocher("alex", "inexistante")).rejects.toThrow(ErreurDomaine);
      await expect(d.cocher("intrus", id)).rejects.toThrow(ErreurDomaine);
      await expect(d.supprimer("intrus", id)).rejects.toThrow(ErreurDomaine);
      await expect(d.enregistrer("alex", { id: "inexistante", titre: "y", assigneId: "alex" })).rejects.toThrow(/inconnue/);
      expect((await trouver(d, id))?.statut).toBe("a_faire");
    });

    it("supprime une tâche, puis la déclare inconnue", async () => {
      const { d } = await monter();
      const { id } = await d.enregistrer("alex", { titre: "x", assigneId: "alex" });
      const autre = await d.enregistrer("alex", { titre: "z", assigneId: "alex" });
      await d.supprimer("sam", id);
      expect(await trouver(d, id)).toBeUndefined();
      expect(await trouver(d, autre.id)).toBeDefined();
      await expect(d.supprimer("alex", id)).rejects.toThrow(/inconnue/);
    });

    it("aujourdhui suit l'horloge injectée, au fuseau Europe/Paris", async () => {
      const { d, h } = await monter();
      expect(d.aujourdhui()).toBe("2026-11-11");
      h.regler("2026-11-14T23:30:00Z");
      expect(d.aujourdhui()).toBe("2026-11-15");
      h.regler("2026-07-14T22:30:00Z");
      expect(d.aujourdhui()).toBe("2026-07-15");
    });

    describe("confidentialité du retard de l'autre adulte", () => {
      const enRetard = async () => {
        const { d, h } = await monter();
        const ponctuelle = await d.enregistrer("alex", { titre: "privée", assigneId: "alex", echeance: "2026-11-09" });
        const serie = await d.enregistrer("alex", { titre: "série privée", assigneId: "alex", echeance: "2026-11-01", recurrence: QUOTIDIENNE });
        return { d, h, ponctuelle: ponctuelle.id, serie: serie.id };
      };

      it("l'autre adulte ne peut ni modifier ni supprimer une tâche ayant du passé, avec la même erreur qu'un id inexistant", async () => {
        const { d, ponctuelle } = await enRetard();
        const inconnue = await d.enregistrer("sam", { id: "inexistante", titre: "y", assigneId: "sam" }).catch((e: Error) => e.message);
        const refus = await d.enregistrer("sam", { id: ponctuelle, titre: "y", assigneId: "sam" }).catch((e: Error) => e.message);
        expect(refus).toBe(String(inconnue).replace("inexistante", ponctuelle));
        await expect(d.supprimer("sam", ponctuelle)).rejects.toThrow(/inconnue/);
        expect((await trouver(d, ponctuelle))?.titre).toBe("privée");
      });

      it("l'autre adulte ne peut cocher ni décocher le passé, que la date existe ou non", async () => {
        const { d, ponctuelle, serie } = await enRetard();
        await expect(d.cocher("sam", ponctuelle)).rejects.toThrow(/réservée/);
        await expect(d.decocher("sam", ponctuelle)).rejects.toThrow(/réservée/);
        await expect(d.cocher("sam", serie, "2026-11-05")).rejects.toThrow(/réservée/);
        await expect(d.cocher("sam", serie, "2020-01-01")).rejects.toThrow(/réservée/);
        expect((await trouver(d, ponctuelle))?.statut).toBe("a_faire");
        expect((await trouver(d, serie))?.exceptions).toBeUndefined();
      });

      it("l'assigné garde la main sur son propre retard", async () => {
        const { d, ponctuelle, serie } = await enRetard();
        await d.cocher("alex", ponctuelle);
        await d.cocher("alex", serie, "2026-11-05");
        expect((await trouver(d, ponctuelle))?.statut).toBe("faite");
        expect((await trouver(d, serie))?.exceptions?.map((e) => e.date)).toEqual(["2026-11-05"]);
      });

      it("l'autre adulte agit sur aujourd'hui et le futur, mais plus dès que le jour est passé", async () => {
        const { d, h } = await monter();
        const { id } = await d.enregistrer("alex", { titre: "du jour", assigneId: "alex", echeance: "2026-11-11" });
        await d.enregistrer("sam", { id, titre: "du jour (modifié)", assigneId: "alex", echeance: "2026-11-11" });
        await d.cocher("sam", id);
        h.regler("2026-11-12T08:00:00Z");
        await expect(d.decocher("sam", id)).rejects.toThrow(/réservée/);
        await expect(d.supprimer("sam", id)).rejects.toThrow(/inconnue/);
      });

      it("déplacer ou réassigner la tâche de l'autre remet statut, date de réalisation et exceptions à zéro", async () => {
        const { d } = await monter();
        const { id } = await d.enregistrer("alex", { titre: "série", assigneId: "alex", echeance: "2026-11-12", recurrence: QUOTIDIENNE });
        await d.cocher("alex", id, "2026-11-13");
        await d.enregistrer("sam", { id, titre: "série", assigneId: "alex", echeance: "2026-11-13", recurrence: QUOTIDIENNE });
        const t = await trouver(d, id);
        expect(t?.exceptions).toBeUndefined();
        expect(t?.statut).toBe("a_faire");

        const p = await d.enregistrer("alex", { titre: "ponctuelle", assigneId: "alex", echeance: "2026-11-20" });
        await d.cocher("alex", p.id);
        await d.enregistrer("sam", { id: p.id, titre: "ponctuelle", assigneId: "sam", echeance: "2026-11-20" });
        expect(await trouver(d, p.id)).toMatchObject({ assigneId: "sam", statut: "a_faire", creeParId: "alex" });
        expect((await trouver(d, p.id))?.faiteLe).toBeUndefined();
      });
    });
  });
}
