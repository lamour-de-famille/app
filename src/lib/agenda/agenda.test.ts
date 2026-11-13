import { beforeEach, describe, expect, it } from "vitest";
import { familleFictive } from "../domaine/fixture-famille";
import type { Creneau, Presence, Transfert } from "../domaine/types";
import { AgendaFactice } from "./agenda-factice";
import { ClientAgendaGoogle } from "./agenda-google";
import { evenementsSouhaites } from "./evenements";
import { PROP_APPLICATION, PROP_CLE, synchroniserFamille } from "./synchro";
import { ErreurAutorisationExpiree, MARQUE_APPLICATION, StockageEtatMemoire } from "./types";

const AGENDA = "primary";

const presences: Presence[] = [
  { enfantId: "leo", date: "2026-11-20", lieuId: "dom-alex" },
  { enfantId: "mila", date: "2026-11-20", lieuId: "dom-alex" },
  { enfantId: "nina", date: "2026-11-20", lieuId: "dom-sam" },
];
const transferts: Transfert[] = [
  { id: "t1", date: "2026-11-21", heure: "17:30", lieuId: "ecole", deposeId: "alex", recupereId: "sam", enfantIds: ["leo", "mila"] },
];
const creneaux: Creneau[] = [{ id: "c1", enfantId: "nina", date: "2026-11-22", debut: "14:00", fin: "15:30", libelle: "Piscine" }];

const donnees = () => ({ famille: familleFictive, presences, transferts: [...transferts], creneaux: [...creneaux] });

describe("evenementsSouhaites (fonction pure)", () => {
  it("produit des événements par adulte, avec clés stables et rôle de transfert propre à chacun", () => {
    const e = evenementsSouhaites(donnees());
    expect(Object.keys(e).sort()).toEqual(["alex", "sam"]);
    expect(e.alex!.map((x) => x.cle)).toEqual([
      "creneau:c1",
      "nuit:2026-11-20:dom-alex",
      "nuit:2026-11-20:dom-sam",
      "transfert:t1",
    ]);
    expect(e.alex!.find((x) => x.cle === "transfert:t1")).toMatchObject({
      titre: "Dépose : Léo, Mila",
      debut: "2026-11-21T17:30",
      fin: "2026-11-21T18:00",
    });
    expect(e.sam!.find((x) => x.cle === "transfert:t1")!.titre).toBe("Récupère : Léo, Mila");
    expect(e.alex!.find((x) => x.cle === "nuit:2026-11-20:dom-alex")).toMatchObject({
      titre: "Nuit : Léo, Mila",
      debut: "2026-11-20",
      fin: "2026-11-21",
    });
  });
  it("est déterministe", () => {
    expect(evenementsSouhaites(donnees())).toEqual(evenementsSouhaites(donnees()));
  });
});

describe("synchro Agenda avec doublure", () => {
  let alex: AgendaFactice;
  let sam: AgendaFactice;
  let stockage: StockageEtatMemoire;
  const lancer = (d = donnees()) =>
    synchroniserFamille({ souhaits: evenementsSouhaites(d), clients: { alex, sam } }, stockage, () => new Date("2026-11-13T10:00:00Z"));
  const marques = (a: AgendaFactice) => a.contenu(AGENDA).filter((e) => e.proprietesPrivees[PROP_APPLICATION] === MARQUE_APPLICATION);

  beforeEach(() => {
    alex = new AgendaFactice();
    sam = new AgendaFactice();
    stockage = new StockageEtatMemoire();
  });

  it("écrit dans l'agenda de chaque adulte, avec marque, clé et empreinte", async () => {
    const etats = await lancer();
    expect(marques(alex)).toHaveLength(4);
    expect(marques(sam)).toHaveLength(4);
    for (const e of marques(alex)) {
      expect(e.proprietesPrivees[PROP_CLE]).toBeTruthy();
      expect(e.proprietesPrivees.empreinte).toMatch(/^[0-9a-f]{16}$/);
    }
    expect(etats.alex).toMatchObject({ statut: "ok", nombreElements: 4, crees: 4, dernierSucces: "2026-11-13T10:00:00.000Z" });
  });

  it("est idempotente : une seconde synchro ne crée aucun doublon ni aucune écriture", async () => {
    await lancer();
    const avant = alex.contenu(AGENDA);
    alex.appels.length = 0;
    const etats = await lancer();
    expect(alex.contenu(AGENDA)).toEqual(avant);
    expect(alex.appels.every((a) => a.action === "lister")).toBe(true);
    expect(etats.alex).toMatchObject({ statut: "ok", crees: 0, modifies: 0, supprimes: 0, nombreElements: 4 });
  });

  it("ne touche jamais un événement étranger, même avec une clé ou une autre marque", async () => {
    const sansMarque = alex.ajouterEtranger(AGENDA, { titre: "Dentiste", debut: "2026-11-20T09:00", fin: "2026-11-20T10:00", proprietesPrivees: {} });
    const fauxAmi = alex.ajouterEtranger(AGENDA, {
      titre: "Autre appli",
      debut: "2026-11-20",
      fin: "2026-11-21",
      proprietesPrivees: { application: "autre-outil", cle: "transfert:t1" },
    });
    const cleSansMarque = alex.ajouterEtranger(AGENDA, {
      titre: "Clé seule",
      debut: "2026-11-20",
      fin: "2026-11-21",
      proprietesPrivees: { cle: "creneau:c1" },
    });
    await lancer();
    // Retrait de tout : l'application supprime ses événements, pas les autres.
    await lancer({ ...donnees(), presences: [], transferts: [], creneaux: [] });
    const restants = alex.contenu(AGENDA);
    expect(restants).toEqual([sansMarque, fauxAmi, cleSansMarque]);
    const ids = new Set([sansMarque.id, fauxAmi.id, cleSansMarque.id]);
    expect(alex.appels.filter((a) => a.action !== "lister" && a.action !== "creer").every((a) => !ids.has(a.id!))).toBe(true);
  });

  it("propage une modification (mise à jour en place, même identifiant)", async () => {
    await lancer();
    const avant = marques(alex).find((e) => e.proprietesPrivees[PROP_CLE] === "transfert:t1")!;
    const d = donnees();
    d.transferts = [{ ...transferts[0]!, heure: "18:00" }];
    const etats = await lancer(d);
    const apres = marques(alex).find((e) => e.proprietesPrivees[PROP_CLE] === "transfert:t1")!;
    expect(apres.id).toBe(avant.id);
    expect(apres.debut).toBe("2026-11-21T18:00");
    expect(apres.proprietesPrivees.empreinte).not.toBe(avant.proprietesPrivees.empreinte);
    expect(marques(alex)).toHaveLength(4);
    expect(etats.alex).toMatchObject({ modifies: 1, crees: 0, supprimes: 0 });
  });

  it("propage une suppression", async () => {
    await lancer();
    const d = donnees();
    d.creneaux = [];
    const etats = await lancer(d);
    expect(marques(alex).map((e) => e.proprietesPrivees[PROP_CLE])).not.toContain("creneau:c1");
    expect(marques(alex)).toHaveLength(3);
    expect(etats.alex).toMatchObject({ supprimes: 1, nombreElements: 3 });
  });

  it("nettoie un doublon marqué laissé par une coupure passée", async () => {
    await lancer();
    const un = marques(alex)[0]!;
    await alex.creer(AGENDA, { ...un, id: undefined } as never);
    expect(marques(alex)).toHaveLength(5);
    await lancer();
    expect(marques(alex)).toHaveLength(4);
  });

  it("à l'expiration : état « à reconnecter », rien perdu, reprise sans doublon", async () => {
    await lancer();
    const d = donnees();
    d.creneaux = [...creneaux, { id: "c2", enfantId: "leo", date: "2026-11-23", debut: "10:00", fin: "11:00", libelle: "Judo" }];
    alex.expirerAutorisation();
    const etats = await lancer(d);
    expect(etats.alex).toMatchObject({ statut: "a_reconnecter", nombreElements: 4, dernierSucces: "2026-11-13T10:00:00.000Z" });
    expect(etats.alex!.erreurs.length).toBeGreaterThan(0);
    expect(etats.sam!.statut).toBe("ok"); // l'autre adulte n'est pas touché
    expect(marques(alex)).toHaveLength(4); // rien perdu
    expect((await stockage.lire("alex"))!.statut).toBe("a_reconnecter");

    alex.retablirAutorisation();
    const reprise = await lancer(d);
    expect(reprise.alex).toMatchObject({ statut: "ok", crees: 1, nombreElements: 5 });
    expect(marques(alex)).toHaveLength(5);
    const cles = marques(alex).map((e) => e.proprietesPrivees[PROP_CLE]);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("coupure en cours de synchro : la reprise termine sans doublon", async () => {
    alex.expirerApresCreations = 2;
    const etats = await lancer();
    expect(etats.alex!.statut).toBe("a_reconnecter");
    expect(marques(alex)).toHaveLength(2);
    alex.retablirAutorisation();
    const reprise = await lancer();
    expect(reprise.alex).toMatchObject({ statut: "ok", crees: 2, nombreElements: 4 });
    expect(marques(alex)).toHaveLength(4);
  });

  it("un adulte sans client est marqué « à reconnecter »", async () => {
    const etats = await synchroniserFamille({ souhaits: evenementsSouhaites(donnees()), clients: { alex } }, stockage);
    expect(etats.sam!.statut).toBe("a_reconnecter");
    expect(etats.alex!.statut).toBe("ok");
  });
});

describe("ClientAgendaGoogle (faux fetch, aucun appel réel)", () => {
  const faux = (statut: number, corps: unknown = {}) => {
    const appels: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      appels.push({ url, init });
      return new Response(JSON.stringify(corps), { status: statut });
    }) as unknown as typeof fetch;
    return { f, appels };
  };

  it("demande seulement les événements marqués et convertit la réponse", async () => {
    const { f, appels } = faux(200, {
      items: [{ id: "g1", summary: "Nuit", start: { date: "2026-11-20" }, end: { date: "2026-11-21" }, extendedProperties: { private: { cle: "k" } } }],
    });
    const liste = await new ClientAgendaGoogle(async () => "jeton-fictif", f).lister("primary", {
      proprietesPrivees: { application: MARQUE_APPLICATION },
    });
    expect(decodeURIComponent(appels[0]!.url)).toContain(`privateExtendedProperty=application=${MARQUE_APPLICATION}`);
    expect(liste[0]).toMatchObject({ id: "g1", debut: "2026-11-20", proprietesPrivees: { cle: "k" } });
  });
  it("traduit un 401 en autorisation expirée", async () => {
    await expect(new ClientAgendaGoogle(async () => "x", faux(401).f).lister("primary")).rejects.toBeInstanceOf(ErreurAutorisationExpiree);
  });
  it("traite une suppression déjà faite (410) comme réussie", async () => {
    await expect(new ClientAgendaGoogle(async () => "x", faux(410).f).supprimer("primary", "g1")).resolves.toBeUndefined();
  });
});
