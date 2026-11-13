import { beforeEach, describe, expect, it } from "vitest";
import { ErreurDomaine, type DepotFamille } from "./depot";
import { familleFictive } from "./fixture-famille";
import type { RegleDerivee, RegleWeekEnd } from "../regles/types";
import type { Famille } from "./types";

const regleWeekEnd = (id: string): RegleWeekEnd => ({
  id,
  type: "week_end",
  libelle: `Week-end fictif ${id}`,
  actif: true,
  priorite: 1,
  parite: "paire",
  responsableId: "alex",
  enfantIds: ["leo", "mila"],
  debut: { jour: 5, heure: "18:00" },
  fin: { jour: 7, heure: "19:00" },
});

const regleDerivee = (id: string, sourceId: string): RegleDerivee => ({
  id,
  type: "derivee",
  libelle: `Dérivée fictive ${id}`,
  actif: true,
  priorite: 2,
  sourceId,
  suitAdulteId: "sam",
  enfantIds: ["nina"],
});

/** Crée un dépôt vierge pour cette famille, avec l'horloge fournie. */
export type FabriqueDepot = (famille: Famille, maintenant: () => Date) => Promise<DepotFamille>;

/**
 * Suite « contrat » : mêmes invariants et même comportement pour toute implémentation de `DepotFamille`
 * (mémoire, Firestore sur banque en mémoire, Firestore sur émulateur).
 */
export function suiteContratDepot(creer: FabriqueDepot) {
  let t = 0;
  const horloge = () => new Date(Date.UTC(2026, 0, 1, 12, 0, t++));
  let depot: DepotFamille;
  beforeEach(async () => {
    t = 0;
    depot = await creer(familleFictive, horloge);
  });

  describe("garde et présence séparées", () => {
    it("permet qu'un enfant soit sous la garde d'un adulte et dorme chez l'autre", async () => {
      await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-10", responsableId: "alex" });
      await depot.definirPresence("alex", { enfantId: "leo", date: "2026-03-10", lieuId: "dom-sam" });
      expect(await depot.listerGardes()).toEqual([
        { enfantId: "leo", date: "2026-03-10", responsableId: "alex" },
      ]);
      expect(await depot.listerPresences({ enfantId: "leo" })).toEqual([
        { enfantId: "leo", date: "2026-03-10", lieuId: "dom-sam" },
      ]);
    });

    it("filtre par enfant et par période (bornes incluses)", async () => {
      for (const date of ["2026-03-09", "2026-03-10", "2026-03-11"]) {
        await depot.definirGarde("sam", { enfantId: "mila", date, responsableId: "sam" });
      }
      await depot.definirGarde("sam", { enfantId: "nina", date: "2026-03-10", responsableId: "alex" });
      const r = await depot.listerGardes({ enfantId: "mila", du: "2026-03-10", au: "2026-03-11" });
      expect(r.map((g) => g.date)).toEqual(["2026-03-10", "2026-03-11"]);
    });

    it("rejette dates, enfants, lieux et adultes invalides", async () => {
      await expect(
        depot.definirGarde("alex", { enfantId: "leo", date: "10/03/2026", responsableId: "alex" }),
      ).rejects.toThrow(ErreurDomaine);
      await expect(
        depot.definirGarde("alex", { enfantId: "inconnu", date: "2026-03-10", responsableId: "alex" }),
      ).rejects.toThrow(ErreurDomaine);
      await expect(
        depot.definirPresence("alex", { enfantId: "leo", date: "2026-03-10", lieuId: "nulle-part" }),
      ).rejects.toThrow(ErreurDomaine);
      await expect(
        depot.definirGarde("intrus", { enfantId: "leo", date: "2026-03-10", responsableId: "alex" }),
      ).rejects.toThrow(ErreurDomaine);
    });
  });

  describe("transferts et créneaux", () => {
    it("enregistre un transfert avec heure réglée et refuse une heure invalide", async () => {
      const tr = await depot.enregistrerTransfert("alex", {
        date: "2026-03-13",
        heure: "16:45",
        lieuId: "ecole",
        deposeId: "alex",
        recupereId: "sam",
        enfantIds: ["leo", "mila"],
      });
      expect(tr.id).toBeTruthy();
      expect(await depot.listerTransferts({ du: "2026-03-13" })).toHaveLength(1);
      await expect(
        depot.enregistrerTransfert("alex", { ...tr, id: undefined, heure: "25:00" }),
      ).rejects.toThrow(ErreurDomaine);
    });

    it("conserve la marque d'origine d'une règle sur un créneau", async () => {
      const c = await depot.enregistrerCreneau("sam", {
        enfantId: "nina",
        date: "2026-03-14",
        debut: "09:00",
        fin: "11:30",
        libelle: "Activité fictive",
        origine: { type: "regle", regleId: "regle-x", ecart: "décalé d'un jour" },
      });
      const lu = (await depot.listerCreneaux({ enfantId: "nina" }))[0]!;
      expect(lu).toEqual(c);
      expect(lu.origine).toEqual({ type: "regle", regleId: "regle-x", ecart: "décalé d'un jour" });
    });

    it("supprime un transfert et trace la suppression", async () => {
      const tr = await depot.enregistrerTransfert("alex", {
        date: "2026-03-13",
        heure: "08:15",
        lieuId: "parc",
        deposeId: "sam",
        recupereId: "alex",
        enfantIds: ["nina"],
      });
      await depot.supprimerTransfert("sam", tr.id);
      expect(await depot.listerTransferts()).toEqual([]);
      const j = await depot.lireJournal();
      expect(j.at(-1)).toMatchObject({ action: "suppression", entite: "transfert" });
      expect(j.at(-1)?.apres).toBeUndefined();
      await expect(depot.supprimerTransfert("sam", tr.id)).rejects.toThrow(ErreurDomaine);
    });
  });

  describe("journal et événements à notifier", () => {
    it("trace qui, quand, quoi, avant/après", async () => {
      await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-10", responsableId: "alex" });
      await depot.definirGarde("sam", { enfantId: "leo", date: "2026-03-10", responsableId: "sam" });
      const j2 = await depot.lireJournal();
      const e1 = j2[0]!;
      const e2 = j2[1]!;
      expect(e1).toMatchObject({ auteurId: "alex", entite: "garde", cle: "leo|2026-03-10", action: "creation" });
      expect(e1.avant).toBeUndefined();
      expect(e2).toMatchObject({ auteurId: "sam", action: "modification" });
      expect(e2.avant).toEqual({ enfantId: "leo", date: "2026-03-10", responsableId: "alex" });
      expect(e2.apres).toEqual({ enfantId: "leo", date: "2026-03-10", responsableId: "sam" });
      expect(e2.quand > e1.quand).toBe(true);
    });

    it("notifie toujours l'autre adulte, jamais l'auteur", async () => {
      await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-10", responsableId: "alex" });
      await depot.definirPresence("sam", { enfantId: "leo", date: "2026-03-10", lieuId: "dom-sam" });
      expect(await depot.evenementsANotifier("alex")).toHaveLength(1);
      expect(await depot.evenementsANotifier("sam")).toHaveLength(1);
      const pourSam = (await depot.evenementsANotifier("sam"))[0]!;
      const journal = await depot.lireJournal();
      expect(journal.find((e) => e.id === pourSam.entreeId)?.auteurId).toBe("alex");
    });

    it("ignore une écriture identique (rien à tracer)", async () => {
      const g = { enfantId: "leo", date: "2026-03-10", responsableId: "alex" };
      await depot.definirGarde("alex", g);
      await depot.definirGarde("alex", g);
      expect(await depot.lireJournal()).toHaveLength(1);
    });

    it("n'envoie rien en cas d'écriture rejetée et permet d'acquitter", async () => {
      await expect(
        depot.definirGarde("alex", { enfantId: "x", date: "2026-03-10", responsableId: "alex" }),
      ).rejects.toThrow();
      expect(await depot.lireJournal()).toEqual([]);
      await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-10", responsableId: "alex" });
      const ev = (await depot.evenementsANotifier("sam"))[0]!;
      await depot.marquerNotifie("sam", ev.id);
      expect(await depot.evenementsANotifier("sam")).toEqual([]);
    });
  });

  describe("demandes d'échange", () => {
    const jours = ["2026-04-03", "2026-04-04"];

    beforeEach(async () => {
      for (const date of jours) {
        for (const enfantId of ["leo", "mila"]) {
          await depot.definirGarde("alex", { enfantId, date, responsableId: "alex" });
          await depot.definirPresence("alex", { enfantId, date, lieuId: "dom-alex" });
        }
      }
    });

    it("acceptée par l'autre adulte : applique gardes et présences aux seuls jours et enfants concernés", async () => {
      const d = await depot.proposerEchange("sam", { responsableId: "sam", enfantIds: ["leo"], jours });
      expect(d.statut).toBe("proposee");
      const r = await depot.repondreEchange("alex", d.id, "acceptee");
      expect(r).toMatchObject({ statut: "acceptee", repondeurId: "alex" });
      expect(r.reponduLe).toBeTruthy();
      const gardes = await depot.listerGardes({ enfantId: "leo" });
      expect(gardes.every((g) => g.responsableId === "sam")).toBe(true);
      const presences = await depot.listerPresences({ enfantId: "leo" });
      expect(presences.every((p) => p.lieuId === "dom-sam")).toBe(true);
      expect((await depot.listerGardes({ enfantId: "mila" })).every((g) => g.responsableId === "alex")).toBe(true);
      expect((await depot.listerPresences({ enfantId: "mila" })).every((p) => p.lieuId === "dom-alex")).toBe(true);
    });

    it("refusée : aucune garde ni présence ne change", async () => {
      const avantG = await depot.listerGardes();
      const avantP = await depot.listerPresences();
      const d = await depot.proposerEchange("sam", { responsableId: "sam", enfantIds: ["leo", "mila"], jours });
      const r = await depot.repondreEchange("alex", d.id, "refusee");
      expect(r.statut).toBe("refusee");
      expect(await depot.listerGardes()).toEqual(avantG);
      expect(await depot.listerPresences()).toEqual(avantP);
    });

    it("l'auteur ne peut pas répondre à sa propre demande ; une demande ne se traite qu'une fois", async () => {
      const d = await depot.proposerEchange("alex", { responsableId: "sam", enfantIds: ["nina"], jours });
      await expect(depot.repondreEchange("alex", d.id, "acceptee")).rejects.toThrow(ErreurDomaine);
      await expect(depot.repondreEchange("intrus", d.id, "acceptee")).rejects.toThrow(ErreurDomaine);
      await depot.repondreEchange("sam", d.id, "refusee");
      await expect(depot.repondreEchange("sam", d.id, "acceptee")).rejects.toThrow(/déjà traitée/);
      expect((await depot.listerGardes({ enfantId: "nina" }))).toEqual([]);
    });

    it("notifie l'autre adulte à la proposition puis à la réponse", async () => {
      const avantSam = (await depot.evenementsANotifier("sam")).length;
      const avantAlex = (await depot.evenementsANotifier("alex")).length;
      const d = await depot.proposerEchange("sam", { responsableId: "sam", enfantIds: ["leo"], jours: [jours[0]!] });
      expect((await depot.evenementsANotifier("alex")).length).toBe(avantAlex + 1);
      expect((await depot.evenementsANotifier("sam")).length).toBe(avantSam);
      await depot.repondreEchange("alex", d.id, "acceptee");
      // demande + garde + présence modifiées par Alex : 3 événements pour Sam
      expect((await depot.evenementsANotifier("sam")).length).toBe(avantSam + 3);
      expect((await depot.evenementsANotifier("alex")).length).toBe(avantAlex + 1);
    });

    it("rejette une demande vide ou hors famille", async () => {
      await expect(depot.proposerEchange("sam", { responsableId: "sam", enfantIds: [], jours })).rejects.toThrow();
      await expect(depot.proposerEchange("sam", { responsableId: "sam", enfantIds: ["leo"], jours: [] })).rejects.toThrow();
      await expect(
        depot.proposerEchange("sam", { responsableId: "inconnu", enfantIds: ["leo"], jours }),
      ).rejects.toThrow();
    });
  });

  describe("marquerNotifie contrôle le destinataire", () => {
    beforeEach(async () => {
      await depot.definirGarde("alex", { enfantId: "leo", date: "2026-03-10", responsableId: "alex" });
    });

    it("acquitte pour le bon destinataire", async () => {
      const ev = (await depot.evenementsANotifier("sam"))[0]!;
      await depot.marquerNotifie("sam", ev.id);
      expect(await depot.evenementsANotifier("sam")).toEqual([]);
    });

    it("refuse l'acquittement par un autre adulte, un inconnu ou pour un événement absent", async () => {
      const ev = (await depot.evenementsANotifier("sam"))[0]!;
      await expect(depot.marquerNotifie("alex", ev.id)).rejects.toThrow(ErreurDomaine);
      await expect(depot.marquerNotifie("intrus", ev.id)).rejects.toThrow(ErreurDomaine);
      await expect(depot.marquerNotifie("sam", "ev-inexistant")).rejects.toThrow(ErreurDomaine);
      expect(await depot.evenementsANotifier("sam")).toHaveLength(1);
    });
  });

  describe("créneaux : heures, dates calendaires, ids", () => {
    const base = { enfantId: "leo", date: "2026-03-14", debut: "09:00", fin: "11:00", libelle: "Test" };

    it("refuse fin avant début mais accepte fin égale au début", async () => {
      await expect(depot.enregistrerCreneau("alex", { ...base, debut: "11:00", fin: "10:59" })).rejects.toThrow(
        ErreurDomaine,
      );
      await expect(depot.enregistrerCreneau("alex", { ...base, debut: "11:00", fin: "11:00" })).resolves.toBeTruthy();
    });

    it("refuse les dates inexistantes et accepte le 29 février d'une année bissextile", async () => {
      for (const date of ["2026-02-31", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10"]) {
        await expect(depot.definirGarde("alex", { enfantId: "leo", date, responsableId: "alex" })).rejects.toThrow(
          ErreurDomaine,
        );
      }
      await expect(depot.enregistrerCreneau("alex", { ...base, date: "2028-02-29" })).resolves.toBeTruthy();
      await expect(depot.enregistrerCreneau("alex", { ...base, date: "2026-02-31" })).rejects.toThrow(ErreurDomaine);
    });

    it("un id généré ne collisionne jamais avec un id fourni", async () => {
      const a = await depot.enregistrerCreneau("alex", { ...base, id: "cr-1" });
      const b = await depot.enregistrerCreneau("alex", { ...base, libelle: "Autre" });
      expect(a.id).toBe("cr-1");
      expect(b.id).not.toBe("cr-1");
      expect(await depot.listerCreneaux()).toHaveLength(2);
    });

    it("un id généré ne collisionne pas pour les transferts non plus", async () => {
      const tr = { date: "2026-03-13", heure: "08:15", lieuId: "parc", deposeId: "sam", recupereId: "alex", enfantIds: ["nina"] };
      await depot.enregistrerTransfert("alex", { ...tr, id: "tr-1" });
      await depot.enregistrerTransfert("alex", { ...tr, id: "tr-2" });
      const c = await depot.enregistrerTransfert("alex", tr);
      expect(["tr-1", "tr-2"]).not.toContain(c.id);
      expect(await depot.listerTransferts()).toHaveLength(3);
    });

    it("fournir un id existant remplace explicitement le créneau", async () => {
      await depot.enregistrerCreneau("alex", { ...base, id: "x" });
      await depot.enregistrerCreneau("alex", { ...base, id: "x", libelle: "Modifié" });
      const l = await depot.listerCreneaux();
      expect(l).toHaveLength(1);
      expect(l[0]!.libelle).toBe("Modifié");
    });
  });

  describe("ordre des listes : tri par id", () => {
    const creneau = { enfantId: "leo", date: "2026-03-14", debut: "09:00", fin: "10:00", libelle: "Test" };
    const transfert = { date: "2026-03-13", heure: "08:15", lieuId: "parc", deposeId: "sam", recupereId: "alex", enfantIds: ["nina"] };

    it("trie créneaux et transferts par id, y compris les ids numériques (ordre des unités de code)", async () => {
      const ids = ["b", "10", "a", "2", "9", "B"];
      for (const id of ids) {
        await depot.enregistrerCreneau("alex", { ...creneau, id });
        await depot.enregistrerTransfert("alex", { ...transfert, id });
      }
      const attendu = ["10", "2", "9", "B", "a", "b"];
      expect((await depot.listerCreneaux()).map((c) => c.id)).toEqual(attendu);
      expect((await depot.listerTransferts()).map((t) => t.id)).toEqual(attendu);
    });

    it("trie gardes et présences par clé « enfant|date », quel que soit l'ordre d'écriture", async () => {
      for (const [enfantId, date] of [["nina", "2026-03-11"], ["leo", "2026-03-12"], ["leo", "2026-03-10"], ["mila", "2026-03-10"]] as const) {
        await depot.definirGarde("alex", { enfantId, date, responsableId: "alex" });
        await depot.definirPresence("alex", { enfantId, date, lieuId: "dom-alex" });
      }
      const attendu = ["leo|2026-03-10", "leo|2026-03-12", "mila|2026-03-10", "nina|2026-03-11"];
      expect((await depot.listerGardes()).map((g) => `${g.enfantId}|${g.date}`)).toEqual(attendu);
      expect((await depot.listerPresences()).map((p) => `${p.enfantId}|${p.date}`)).toEqual(attendu);
    });

    it("trie règles et demandes par id ; le journal reste chronologique", async () => {
      for (const id of ["r-b", "r-10", "r-2", "r-a"]) await depot.enregistrerRegle("alex", regleWeekEnd(id));
      expect((await depot.listerRegles()).map((r) => r.id)).toEqual(["r-10", "r-2", "r-a", "r-b"]);
      for (const jour of ["2026-04-03", "2026-04-04", "2026-04-05"]) {
        await depot.proposerEchange("sam", { responsableId: "sam", enfantIds: ["leo"], jours: [jour] });
      }
      const idsDemandes = (await depot.listerDemandes()).map((d) => d.id);
      expect(idsDemandes).toEqual([...idsDemandes].sort());
      const journal = await depot.lireJournal();
      expect(journal.map((e) => e.cle).slice(0, 4)).toEqual(["r-b", "r-10", "r-2", "r-a"]);
    });
  });

  describe("règles", () => {
    it("enregistre, remplace et supprime une règle, avec trace au journal", async () => {
      const r = await depot.enregistrerRegle("alex", regleWeekEnd("we-1"));
      expect(r).toEqual(regleWeekEnd("we-1"));
      await depot.enregistrerRegle("alex", { ...regleWeekEnd("we-1"), priorite: 7 });
      const l = await depot.listerRegles();
      expect(l).toHaveLength(1);
      expect(l[0]!.priorite).toBe(7);
      await depot.supprimerRegle("sam", "we-1");
      expect(await depot.listerRegles()).toEqual([]);
      const j = await depot.lireJournal();
      expect(j.map((e) => [e.entite, e.action])).toEqual([
        ["regle", "creation"],
        ["regle", "modification"],
        ["regle", "suppression"],
      ]);
      expect(j[2]!.apres).toBeUndefined();
      await expect(depot.supprimerRegle("sam", "we-1")).rejects.toThrow(ErreurDomaine);
    });

    it("rejette une règle invalide ou d'un adulte inconnu, sans rien tracer", async () => {
      await expect(depot.enregistrerRegle("intrus", regleWeekEnd("we-1"))).rejects.toThrow(ErreurDomaine);
      await expect(
        depot.enregistrerRegle("alex", { ...regleWeekEnd("we-1"), responsableId: "inconnu" }),
      ).rejects.toThrow(ErreurDomaine);
      await expect(depot.enregistrerRegle("alex", { ...regleWeekEnd("we-1"), enfantIds: [] })).rejects.toThrow(ErreurDomaine);
      expect(await depot.listerRegles()).toEqual([]);
      expect(await depot.lireJournal()).toEqual([]);
    });

    it("accepte une règle dérivée d'une règle source, et refuse source inconnue, auto-référence ou chaîne de dérivées", async () => {
      await depot.enregistrerRegle("alex", regleWeekEnd("we-1"));
      const d = await depot.enregistrerRegle("alex", regleDerivee("der-1", "we-1"));
      expect(d).toMatchObject({ type: "derivee", sourceId: "we-1" });
      await expect(depot.enregistrerRegle("alex", regleDerivee("der-2", "absente"))).rejects.toThrow(/source inconnue/);
      await expect(depot.enregistrerRegle("alex", regleDerivee("der-3", "der-3"))).rejects.toThrow(ErreurDomaine);
      await expect(depot.enregistrerRegle("alex", regleDerivee("der-4", "der-1"))).rejects.toThrow(/autre dérivée/);
      expect((await depot.listerRegles()).map((r) => r.id)).toEqual(["der-1", "we-1"]);
    });

    it("refuse de supprimer une règle dont d'autres dépendent, puis l'autorise une fois la dérivée supprimée", async () => {
      await depot.enregistrerRegle("alex", regleWeekEnd("we-1"));
      await depot.enregistrerRegle("alex", regleDerivee("der-1", "we-1"));
      await expect(depot.supprimerRegle("alex", "we-1")).rejects.toThrow(/der-1/);
      expect(await depot.listerRegles()).toHaveLength(2);
      const nbJournal = (await depot.lireJournal()).length;
      await depot.supprimerRegle("alex", "der-1");
      await depot.supprimerRegle("alex", "we-1");
      expect(await depot.listerRegles()).toEqual([]);
      expect(await depot.lireJournal()).toHaveLength(nbJournal + 2);
    });

    it("refuse qu'une règle dont d'autres dépendent devienne dérivée", async () => {
      await depot.enregistrerRegle("alex", regleWeekEnd("we-1"));
      await depot.enregistrerRegle("alex", regleWeekEnd("we-2"));
      await depot.enregistrerRegle("alex", regleDerivee("der-1", "we-1"));
      await expect(depot.enregistrerRegle("alex", regleDerivee("we-1", "we-2"))).rejects.toThrow(/dépendent/);
      expect((await depot.listerRegles()).find((r) => r.id === "we-1")?.type).toBe("week_end");
    });

    it("notifie l'autre adulte d'un changement de règle", async () => {
      await depot.enregistrerRegle("alex", regleWeekEnd("we-1"));
      expect(await depot.evenementsANotifier("sam")).toHaveLength(1);
      expect(await depot.evenementsANotifier("alex")).toHaveLength(0);
    });
  });

  describe("famille (contrat)", () => {
    it("isole l'état interne de la copie retournée", async () => {
      const f = await depot.lireFamille();
      f.enfants[0]!.prenom = "Modifié";
      expect((await depot.lireFamille()).enfants[0]!.prenom).toBe("Léo");
    });
  });
}
