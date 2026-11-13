import { beforeEach, describe, expect, it } from "vitest";
import { DepotMemoire } from "./depot-memoire";
import { ErreurDomaine } from "./depot";
import { familleFictive } from "./fixture-famille";

let t = 0;
const horloge = () => new Date(Date.UTC(2026, 0, 1, 12, 0, t++));

let depot: DepotMemoire;
beforeEach(() => {
  t = 0;
  depot = new DepotMemoire(familleFictive, { maintenant: horloge });
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
    expect(j.at(-1)).toMatchObject({ action: "suppression", entite: "transfert", apres: undefined });
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

describe("famille", () => {
  it("rejette une couleur non hexadécimale et isole l'état interne", async () => {
    const mauvaise = { ...familleFictive, enfants: [{ id: "x", prenom: "X", couleur: "rouge" }] };
    expect(() => new DepotMemoire(mauvaise)).toThrow(ErreurDomaine);
    const f = await depot.lireFamille();
    f.enfants[0]!.prenom = "Modifié";
    expect((await depot.lireFamille()).enfants[0]!.prenom).toBe("Léo");
  });

  it("la fixture contient Alex, Sam, Léo, Mila et Nina", () => {
    expect(familleFictive.adultes.map((a) => a.prenom)).toEqual(["Alex", "Sam"]);
    expect(familleFictive.enfants.map((e) => e.prenom)).toEqual(["Léo", "Mila", "Nina"]);
  });
});
