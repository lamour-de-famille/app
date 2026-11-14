import { describe, expect, it } from "vitest";
import { familleFictive as famille } from "../domaine/fixture-famille";
import { DepotTachesMemoire, tachesPourAdulte } from "./index";

const AUJ = "2026-11-11";
const nouveau = () => new DepotTachesMemoire(famille, { maintenant: () => new Date("2026-11-11T08:00:00Z") });
const SERIE = { frequence: "quotidienne", intervalle: 1 } as const;
const sens = [
  { nom: "Sam sonde Alex", proprio: "alex", intrus: "sam" },
  { nom: "Alex sonde Sam", proprio: "sam", intrus: "alex" },
] as const;

describe("écritures sur le passé de l'autre adulte : pas de fuite", () => {
  for (const { nom, proprio, intrus } of sens) {
    describe(nom, () => {
      it("déplacer l'échéance d'une tâche passée : refus identique à « tâche inconnue »", async () => {
        const d = nouveau();
        const faite = await d.enregistrer(proprio, { titre: "A", assigneId: proprio, echeance: "2026-11-03" });
        const pasFaite = await d.enregistrer(proprio, { titre: "B", assigneId: proprio, echeance: "2026-11-04" });
        await d.cocher(proprio, faite.id);
        const essai = (id: string) => d.enregistrer(intrus, { id, titre: "x", assigneId: proprio, echeance: AUJ }).then(() => "", (e: Error) => e.message);
        const inconnu = await essai("tache-99");
        expect(inconnu).toMatch(/Tâche inconnue/);
        for (const t of [faite, pasFaite]) expect((await essai(t.id)).replace(t.id, "ID")).toBe(inconnu.replace("tache-99", "ID"));
        const v = await tachesPourAdulte(d, famille, intrus);
        expect([...v.aujourdhui, ...v.cetteSemaine, ...v.aRattraper, ...v.sansEcheance]).toEqual([]);
        expect(await d.lister()).toMatchObject([{ echeance: "2026-11-03", statut: "faite" }, { echeance: "2026-11-04", statut: "a_faire" }]);
      });

      it("réassigner une série passée à soi : refus, aucun jour non fait exposé", async () => {
        const d = nouveau();
        const s = await d.enregistrer(proprio, { titre: "S", assigneId: proprio, echeance: "2026-11-02", recurrence: SERIE });
        await d.cocher(proprio, s.id, "2026-11-05");
        const base = { id: s.id, titre: "S", echeance: "2026-11-02", recurrence: SERIE };
        await expect(d.enregistrer(intrus, { ...base, assigneId: intrus })).rejects.toThrow(/Tâche inconnue/);
        // Aussi pour un simple changement de titre, d'ancre ou de récurrence : une seule erreur.
        await expect(d.enregistrer(intrus, { ...base, assigneId: proprio, titre: "T" })).rejects.toThrow(/Tâche inconnue/);
        await expect(d.enregistrer(intrus, { ...base, assigneId: proprio, echeance: AUJ })).rejects.toThrow(/Tâche inconnue/);
        await expect(d.enregistrer(intrus, { id: s.id, titre: "S", assigneId: proprio })).rejects.toThrow(/Tâche inconnue/);
        expect((await tachesPourAdulte(d, famille, intrus)).aRattraper).toEqual([]);
      });

      it("supprimer une tâche passée : refus ; l'assigné le peut", async () => {
        const d = nouveau();
        const p = await d.enregistrer(proprio, { titre: "P", assigneId: proprio, echeance: "2026-11-03" });
        const s = await d.enregistrer(proprio, { titre: "S", assigneId: proprio, echeance: "2026-11-02", recurrence: SERIE });
        for (const id of [p.id, s.id]) await expect(d.supprimer(intrus, id)).rejects.toThrow(/Tâche inconnue/);
        expect(await d.lister()).toHaveLength(2);
        await d.supprimer(proprio, p.id);
        await d.supprimer(proprio, s.id);
        expect(await d.lister()).toHaveLength(0);
      });

      it("l'assigné qui passe une tâche passée à l'autre : aucun statut ni retard ne suit", async () => {
        const d = nouveau();
        const faite = await d.enregistrer(proprio, { titre: "F", assigneId: proprio, echeance: "2026-11-03" });
        const pasFaite = await d.enregistrer(proprio, { titre: "N", assigneId: proprio, echeance: "2026-11-03" });
        const s = await d.enregistrer(proprio, { titre: "S", assigneId: proprio, echeance: "2026-11-02", recurrence: SERIE });
        await d.cocher(proprio, faite.id);
        await d.cocher(proprio, s.id, "2026-11-05");
        for (const t of [faite, pasFaite]) await d.enregistrer(proprio, { id: t.id, titre: "x", assigneId: intrus, echeance: "2026-11-03" });
        await d.enregistrer(proprio, { id: s.id, titre: "S", assigneId: intrus, echeance: "2026-11-02", recurrence: SERIE });
        const [a, b, c] = await d.lister();
        expect(a).toMatchObject({ statut: "a_faire" });
        expect(b).toMatchObject({ statut: "a_faire" });
        expect(a!.faiteLe).toBeUndefined();
        expect(c!.exceptions ?? []).toEqual([]);
      });

      it("l'assigné modifie librement le passé de sa propre tâche", async () => {
        const d = nouveau();
        const p = await d.enregistrer(proprio, { titre: "P", assigneId: proprio, echeance: "2026-11-03" });
        await expect(d.enregistrer(proprio, { id: p.id, titre: "P", assigneId: proprio, echeance: AUJ })).resolves.toEqual({ id: p.id });
      });

      it("tâche à venir de l'autre : déplacer ou réassigner remet statut et exceptions à zéro", async () => {
        const d = nouveau();
        const p = await d.enregistrer(proprio, { titre: "P", assigneId: proprio, echeance: "2026-11-13" });
        await d.cocher(proprio, p.id); // faite d'avance
        const s = await d.enregistrer(proprio, { titre: "S", assigneId: proprio, echeance: AUJ, recurrence: SERIE });
        await d.cocher(proprio, s.id, "2026-11-12");
        await d.enregistrer(intrus, { id: p.id, titre: "P", assigneId: intrus, echeance: "2026-11-09" });
        await d.enregistrer(intrus, { id: s.id, titre: "S", assigneId: intrus, echeance: AUJ, recurrence: SERIE });
        const [tp, ts] = await d.lister();
        expect(tp).toMatchObject({ statut: "a_faire", assigneId: intrus });
        expect(tp!.faiteLe).toBeUndefined();
        expect(ts!.exceptions).toBeUndefined();
        // Seul le retard qu'il a lui-même choisi apparaît ; rien de l'autre n'a suivi.
        expect((await tachesPourAdulte(d, famille, intrus)).aRattraper.map((o) => o.date)).toEqual(["2026-11-09"]);
      });

      it("changer seulement le titre d'une tâche à venir de l'autre conserve statut et exceptions", async () => {
        const d = nouveau();
        const s = await d.enregistrer(proprio, { titre: "S", assigneId: proprio, echeance: AUJ, recurrence: SERIE });
        await d.cocher(proprio, s.id, "2026-11-12");
        await d.enregistrer(intrus, { id: s.id, titre: "Nouveau", assigneId: proprio, echeance: AUJ, recurrence: SERIE });
        expect((await d.lister())[0]).toMatchObject({ titre: "Nouveau", exceptions: [{ date: "2026-11-12" }] });
      });
    });
  }
});

describe("tachesPourAdulte : le jour courant vient de l'horloge du dépôt", () => {
  it("un ancien 4e argument « aujourd'hui » n'a aucun effet", async () => {
    const d = nouveau();
    await d.enregistrer("alex", { titre: "R", assigneId: "alex", echeance: "2026-11-05" });
    expect(d.aujourdhui()).toBe(AUJ);
    const v = await tachesPourAdulte(d, famille, "sam", "2026-11-02" as never);
    expect([...v.aujourdhui, ...v.cetteSemaine, ...v.aRattraper, ...v.sansEcheance]).toEqual([]);
  });

  for (const { nom, proprio, intrus } of sens) {
    it(`suit l'horloge injectée (${nom})`, async () => {
      let t = new Date("2026-11-11T08:00:00Z");
      const d = new DepotTachesMemoire(famille, { maintenant: () => t });
      await d.enregistrer(proprio, { titre: "R", assigneId: proprio, echeance: "2026-11-12" });
      expect((await tachesPourAdulte(d, famille, intrus)).cetteSemaine).toHaveLength(1);
      t = new Date("2026-11-13T08:00:00Z");
      expect((await tachesPourAdulte(d, famille, proprio)).aRattraper).toHaveLength(1);
      expect(await tachesPourAdulte(d, famille, intrus)).toMatchObject({ aRattraper: [], cetteSemaine: [], aujourdhui: [] });
    });
  }
});
