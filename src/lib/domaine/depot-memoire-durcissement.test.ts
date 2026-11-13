import { beforeEach, describe, expect, it } from "vitest";
import { DepotMemoire } from "./depot-memoire";
import { ErreurDomaine } from "./depot";
import { familleFictive } from "./fixture-famille";
import type { Famille } from "./types";

let t = 0;
const horloge = () => new Date(Date.UTC(2026, 0, 1, 12, 0, t++));
let depot: DepotMemoire;
beforeEach(() => {
  t = 0;
  depot = new DepotMemoire(familleFictive, { maintenant: horloge });
});

const avec = (modif: Partial<Famille>): Famille => ({ ...familleFictive, ...modif });

describe("repondreEchange atomique", () => {
  it("n'écrit rien si le domicile du responsable est introuvable", async () => {
    const d = await depot.proposerEchange("sam", {
      responsableId: "sam",
      enfantIds: ["leo", "mila"],
      jours: ["2026-04-03", "2026-04-04"],
    });
    // Corruption simulée après construction : le calcul doit échouer avant toute écriture.
    (depot as unknown as { famille: Famille }).famille.lieux = [];
    const journalAvant = await depot.lireJournal();
    const evAvant = await depot.evenementsANotifier("sam");
    await expect(depot.repondreEchange("alex", d.id, "acceptee")).rejects.toThrow(ErreurDomaine);
    expect((await depot.listerDemandes())[0]!.statut).toBe("proposee");
    expect(await depot.listerGardes()).toEqual([]);
    expect(await depot.listerPresences()).toEqual([]);
    expect(await depot.lireJournal()).toEqual(journalAvant);
    expect(await depot.evenementsANotifier("sam")).toEqual(evAvant);
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

describe("validation de la famille à la création", () => {
  it("refuse deux adultes de même id", () => {
    const a = familleFictive.adultes[0];
    expect(() => new DepotMemoire(avec({ adultes: [a, { ...a, prenom: "Autre" }] }))).toThrow(/adultes/);
  });

  it("refuse l'absence de domicile_a ou de domicile_b", () => {
    const sansA = familleFictive.lieux.filter((l) => l.type !== "domicile_a");
    const sansB = familleFictive.lieux.filter((l) => l.type !== "domicile_b");
    expect(() => new DepotMemoire(avec({ lieux: sansA }))).toThrow(/domicile_a/);
    expect(() => new DepotMemoire(avec({ lieux: sansB }))).toThrow(/domicile_b/);
  });

  it("refuse des ids de lieux en double", () => {
    const lieux = [...familleFictive.lieux, { id: "parc", type: "autre" as const, libelle: "Doublon" }];
    expect(() => new DepotMemoire(avec({ lieux }))).toThrow(/lieu/i);
  });

  it("refuse des ids d'enfants en double", () => {
    const e = familleFictive.enfants[0]!;
    expect(() => new DepotMemoire(avec({ enfants: [e, { ...e }] }))).toThrow(/enfant/i);
  });

  it("accepte la famille fictive", () => {
    expect(() => new DepotMemoire(familleFictive)).not.toThrow();
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
