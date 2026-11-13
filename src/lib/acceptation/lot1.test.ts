/**
 * Acceptation du lot 1, de bout en bout, sans réseau : vacances (doublure) -> règles -> planning d'un mois
 * -> échange Sam/Alex -> synchro Agenda (doublure avec événements étrangers, expiration puis reprise).
 * Famille, règles et dates sont fictives et volontairement non réalistes.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { AgendaFactice } from "../agenda/agenda-factice";
import { evenementsSouhaites } from "../agenda/evenements";
import { PROP_APPLICATION, PROP_CLE, synchroniserFamille } from "../agenda/synchro";
import { MARQUE_APPLICATION, StockageEtatMemoire, type EvenementAgenda } from "../agenda/types";
import { DepotMemoire } from "../domaine/depot-memoire";
import { familleFictive } from "../domaine/fixture-famille";
import { appliquerRegles } from "../regles/application";
import { genererSegments } from "../regles/moteur";
import type { PeriodeVacances as PeriodeMoteur, Regle } from "../regles/types";
import { ClientVacancesDoublure, importerVacances, periodesPourMoteur } from "../vacances";

const MOIS = "2026-12";
const AGENDA = "primary";
const BORNES = { du: "2026-12-01", au: "2026-12-31" };

const regles: Regle[] = [
  {
    id: "we-pair",
    type: "week_end",
    libelle: "Semaines paires : samedi 10:00 au dimanche 17:00",
    actif: true,
    priorite: 0,
    parite: "paire",
    responsableId: "sam",
    enfantIds: ["leo", "mila"],
    debut: { jour: 6, heure: "10:00" },
    fin: { jour: 7, heure: "17:00" },
  },
  {
    id: "we-impair",
    type: "week_end",
    libelle: "Semaines impaires : vendredi 18:00 au lundi 08:30",
    actif: true,
    priorite: 0,
    parite: "impaire",
    responsableId: "alex",
    enfantIds: ["leo", "mila"],
    debut: { jour: 5, heure: "18:00" },
    fin: { jour: 1, heure: "08:30" },
    lieuTransfertId: "parc",
  },
  {
    id: "nina-suit-sam",
    type: "derivee",
    libelle: "Nina suit Sam",
    actif: true,
    priorite: 0,
    sourceId: "we-pair",
    suitAdulteId: "sam",
    enfantIds: ["nina"],
  },
  {
    id: "vac-petites",
    type: "vacances",
    libelle: "Noël en moitiés",
    actif: true,
    priorite: 5,
    nomContient: "noel",
    parts: 2,
    attributions: { paire: ["alex", "sam"], impaire: ["sam", "alex"] },
    enfantIds: ["leo", "mila", "nina"],
    departDecompte: "jour_officiel",
    heureChangement: "18:00",
    anneeReference: "debut",
  },
  {
    id: "vac-ete",
    type: "vacances",
    libelle: "Été en quarts",
    actif: true,
    priorite: 5,
    nomContient: "ete",
    parts: 4,
    attributions: { paire: ["alex", "sam", "sam", "alex"], impaire: ["sam", "alex", "alex", "sam"] },
    enfantIds: ["leo", "mila", "nina"],
    departDecompte: "jour_officiel",
    heureChangement: "09:00",
    anneeReference: "debut",
  },
];

const cle = (e: EvenementAgenda) => e.proprietesPrivees[PROP_CLE]!;
const marques = (a: AgendaFactice) => a.contenu(AGENDA).filter((e) => e.proprietesPrivees[PROP_APPLICATION] === MARQUE_APPLICATION);
const parCle = (evs: EvenementAgenda[]) => new Map(evs.map((e) => [cle(e), e]));

describe("acceptation du lot 1", () => {
  let periodes: PeriodeMoteur[];
  let depot: DepotMemoire;
  let alex: AgendaFactice;
  let sam: AgendaFactice;
  let stockage: StockageEtatMemoire;
  let etrangers: Record<"alex" | "sam", EvenementAgenda[]>;
  let t = 0;

  const synchro = async () => {
    const [presences, transferts, creneaux] = await Promise.all([
      depot.listerPresences(BORNES),
      depot.listerTransferts(BORNES),
      depot.listerCreneaux(BORNES),
    ]);
    const souhaits = evenementsSouhaites({ famille: await depot.lireFamille(), presences, transferts, creneaux });
    return { souhaits, etats: await synchroniserFamille({ souhaits, clients: { alex, sam } }, stockage, () => new Date("2026-11-13T10:00:00Z")) };
  };
  const nbNotifs = async (adulteId: string) => (await depot.evenementsANotifier(adulteId)).length;
  const viderNotifs = async (adulteId: string) => {
    for (const e of await depot.evenementsANotifier(adulteId)) await depot.marquerNotifie(adulteId, e.id);
  };
  const instantane = async () => JSON.stringify([await depot.listerGardes(BORNES), await depot.listerPresences(BORNES)]);

  beforeAll(async () => {
    depot = new DepotMemoire(familleFictive, { maintenant: () => new Date(Date.UTC(2026, 10, 13, 9, 0, t++)) });
    alex = new AgendaFactice();
    sam = new AgendaFactice();
    stockage = new StockageEtatMemoire();
    const etranger = (a: AgendaFactice, titre: string, proprietesPrivees: Record<string, string>) =>
      a.ajouterEtranger(AGENDA, { titre, debut: "2026-12-05T09:00", fin: "2026-12-05T10:00", proprietesPrivees });
    etrangers = {
      alex: [
        etranger(alex, "Dentiste (sans marque)", {}),
        etranger(alex, "Autre outil, même clé", { application: "autre-outil", cle: "nuit:2026-12-05:dom-sam" }),
        etranger(alex, "Clé seule", { cle: "nuit:2026-12-21:dom-alex" }),
      ],
      sam: [etranger(sam, "Réunion (sans marque)", {})],
    };
  });

  it("(1) importe les vacances depuis la doublure et les convertit pour le moteur", async () => {
    const publiees = await importerVacances(new ClientVacancesDoublure(), { zone: "Zone A", academie: "Lyon", anneeScolaire: "2026-2027" });
    const noel = publiees.find((p) => p.nom.includes("Noël"))!;
    expect(noel).toMatchObject({ debut: "2026-12-19", fin: "2027-01-04" }); // fin publiée = jour de reprise
    periodes = periodesPourMoteur(publiees);
    expect(periodes.find((p) => p.nom.includes("Noël"))).toEqual({
      nom: "Vacances de Noël",
      debut: "2026-12-19",
      fin: "2027-01-03", // dernier jour inclus
      zone: "Zone A",
    });
    expect(periodes.some((p) => p.nom.includes("Pré-rentrée"))).toBe(false);
  });

  it("(2) découpe l'été en quarts selon la parité de l'année", () => {
    const quarts = ["2027-07", "2027-08"]
      .flatMap((m) => genererSegments(regles, periodes, m))
      .filter((s, i, tous) => s.regleId === "vac-ete" && tous.findIndex((x) => x.regleId === s.regleId && x.debut.date === s.debut.date) === i);
    // Été 2027 (année impaire) : du 2 juillet au 30 août inclus = 60 jours, quarts de 15 jours.
    expect(quarts.map((s) => [s.debut.date, s.responsableId, s.nuits.length])).toEqual([
      ["2027-07-02", "sam", 15],
      ["2027-07-17", "alex", 15],
      ["2027-08-01", "alex", 15],
      ["2027-08-16", "sam", 15],
    ]);
  });

  it("(2) génère et applique un mois complet, créneaux marqués règle, idempotent", async () => {
    for (const r of regles) await depot.enregistrerRegle("alex", r);
    const premier = await appliquerRegles(depot, "alex", MOIS, periodes);
    expect(premier.creneauxEcrits).toBeGreaterThan(30);
    expect(premier.gardesEcrites).toBeGreaterThan(30);

    const creneaux = await depot.listerCreneaux(BORNES);
    const ids = new Set(regles.map((r) => r.id));
    expect(creneaux.every((c) => c.origine?.type === "regle" && ids.has(c.origine.regleId) && c.id.startsWith("rg:"))).toBe(true);
    const de = (regleId: string, enfantId: string, date: string) =>
      creneaux.find((c) => c.origine?.regleId === regleId && c.enfantId === enfantId && c.date === date);

    // Semaine 50 (paire) : Sam du samedi 12 10:00 au dimanche 13 17:00.
    expect(de("we-pair", "leo", "2026-12-12")).toMatchObject({ debut: "10:00", fin: "23:59" });
    expect(de("we-pair", "leo", "2026-12-13")).toMatchObject({ debut: "00:00", fin: "17:00" });
    // Règle dérivée : Nina suit Sam sur le même week-end, marquée par sa propre règle.
    expect(de("nina-suit-sam", "nina", "2026-12-12")).toMatchObject({ debut: "10:00" });
    expect(de("we-pair", "nina", "2026-12-12")).toBeUndefined();
    // Semaine 49 (impaire) : Alex du vendredi 4 18:00 au lundi 7 08:30.
    expect(de("we-impair", "mila", "2026-12-04")).toMatchObject({ debut: "18:00" });
    expect(de("we-impair", "mila", "2026-12-07")).toMatchObject({ debut: "00:00", fin: "08:30" });
    // Noël (année 2026, paire) : moitiés Alex puis Sam, changement le 27 à 18:00 ; la règle de vacances l'emporte.
    expect(de("vac-petites", "leo", "2026-12-19")).toMatchObject({ debut: "18:00" });
    const le27 = creneaux.filter((c) => c.origine?.regleId === "vac-petites" && c.enfantId === "leo" && c.date === "2026-12-27");
    expect(le27.map((c) => [c.debut, c.fin])).toEqual([
      ["00:00", "18:00"],
      ["18:00", "23:59"],
    ]);
    expect(de("we-pair", "leo", "2026-12-26")).toBeUndefined();

    const gardes = await depot.listerGardes({ ...BORNES, enfantId: "leo" });
    const garde = (d: string) => gardes.find((g) => g.date === d)?.responsableId;
    expect([garde("2026-12-12"), garde("2026-12-20"), garde("2026-12-27"), garde("2026-12-31")]).toEqual(["sam", "alex", "sam", "sam"]);
    expect(gardes.every((g) => g.origine === "regle")).toBe(true);
    const nuit = (await depot.listerPresences({ ...BORNES, enfantId: "nina" })).find((p) => p.date === "2026-12-12");
    expect(nuit).toMatchObject({ lieuId: "dom-sam", origine: "regle" });
    expect((await depot.listerTransferts(BORNES)).some((x) => x.lieuId === "parc")).toBe(true);

    const avant = await instantane();
    const second = await appliquerRegles(depot, "alex", MOIS, periodes);
    expect(Object.values(second).every((n) => n === 0)).toBe(true);
    expect(await instantane()).toBe(avant);
  });

  it("(3) proposition puis acceptation : mises à jour et événement à notifier à chaque étape", async () => {
    await viderNotifs("alex");
    await viderNotifs("sam");
    const garde = async (e: string, d: string) => (await depot.listerGardes({ ...BORNES, enfantId: e })).find((g) => g.date === d);

    // Sam demande la nuit du samedi 5 (week-end d'Alex) pour Léo et Mila.
    const demande = await depot.proposerEchange("sam", { responsableId: "sam", enfantIds: ["leo", "mila"], jours: ["2026-12-05"] });
    expect(demande.statut).toBe("proposee");
    expect(await nbNotifs("alex")).toBe(1);
    expect(await nbNotifs("sam")).toBe(0);
    expect(await garde("leo", "2026-12-05")).toMatchObject({ responsableId: "alex", origine: "regle" });

    await expect(depot.repondreEchange("sam", demande.id, "acceptee")).rejects.toThrow(); // l'auteur ne répond pas
    await viderNotifs("alex");
    const acceptee = await depot.repondreEchange("alex", demande.id, "acceptee");
    expect(acceptee).toMatchObject({ statut: "acceptee", repondeurId: "alex" });
    expect(await nbNotifs("sam")).toBeGreaterThan(0);
    expect(await nbNotifs("alex")).toBe(0);

    for (const e of ["leo", "mila"]) {
      expect(await garde(e, "2026-12-05")).toEqual({ enfantId: e, date: "2026-12-05", responsableId: "sam" });
      const p = (await depot.listerPresences({ ...BORNES, enfantId: e })).find((x) => x.date === "2026-12-05");
      expect(p).toEqual({ enfantId: e, date: "2026-12-05", lieuId: "dom-sam" });
    }
    expect(await garde("leo", "2026-12-04")).toMatchObject({ responsableId: "alex" }); // les jours voisins sont intacts

    // Réappliquer les règles ne défait pas un échange accepté (saisie sans marque).
    await appliquerRegles(depot, "alex", MOIS, periodes);
    expect(await garde("leo", "2026-12-05")).toEqual({ enfantId: "leo", date: "2026-12-05", responsableId: "sam" });
  });

  it("(3) un refus ne change ni gardes ni présences mais notifie l'auteur", async () => {
    await viderNotifs("alex");
    await viderNotifs("sam");
    const avant = await instantane();
    const demande = await depot.proposerEchange("sam", { responsableId: "sam", enfantIds: ["leo"], jours: ["2026-12-08", "2026-12-09"] });
    expect(await nbNotifs("alex")).toBe(1);
    const refusee = await depot.repondreEchange("alex", demande.id, "refusee");
    expect(refusee.statut).toBe("refusee");
    expect(await nbNotifs("sam")).toBe(1);
    expect(await instantane()).toBe(avant);
    await expect(depot.repondreEchange("alex", demande.id, "acceptee")).rejects.toThrow(); // déjà traitée
  });

  it("(4) première synchro, puis relance sans écriture ni doublon, événements étrangers intacts", async () => {
    // Première synchro sur le planning courant (échange du 5 décembre inclus).
    const { souhaits, etats } = await synchro();
    const voulus = souhaits.alex!.length;
    expect(voulus).toBeGreaterThan(60);
    expect(marques(alex)).toHaveLength(voulus);
    expect(marques(sam)).toHaveLength(souhaits.sam!.length);
    expect(etats.alex).toMatchObject({ statut: "ok", crees: voulus, modifies: 0, supprimes: 0 });
    expect(new Set(marques(alex).map(cle)).size).toBe(voulus); // pas de doublon
    expect(alex.contenu(AGENDA).filter((e) => !marques(alex).includes(e) && etrangers.alex.some((x) => x.id === e.id))).toHaveLength(3);

    alex.appels.length = 0;
    sam.appels.length = 0;
    const apres = await synchro();
    expect(alex.appels.every((a) => a.action === "lister")).toBe(true);
    expect(sam.appels.every((a) => a.action === "lister")).toBe(true);
    expect(apres.etats.alex).toMatchObject({ statut: "ok", crees: 0, modifies: 0, supprimes: 0 });
    expect(marques(alex)).toHaveLength(voulus);
  });

  it("(4) après un nouvel échange, seuls les événements concernés changent", async () => {
    const avantAlex = parCle(marques(alex));
    const avantSam = parCle(marques(sam));
    // Sam obtient Léo les nuits des 21 et 22 décembre (moitié d'Alex).
    const d = await depot.proposerEchange("sam", { responsableId: "sam", enfantIds: ["leo"], jours: ["2026-12-21", "2026-12-22"] });
    await depot.repondreEchange("alex", d.id, "acceptee");

    // Coupure en cours de synchro : l'autorisation d'Alex expire après une création.
    alex.expirerApresCreations = avantAlex.size + 1; // la doublure compte les créations depuis le début
    const interrompue = await synchro();
    expect(interrompue.etats.alex).toMatchObject({ statut: "a_reconnecter", crees: 1, modifies: 2 });
    expect(interrompue.etats.sam).toMatchObject({ statut: "ok", crees: 2 });
    expect(marques(alex)).toHaveLength(avantAlex.size + 1);

    // Reprise : aucune création en double, l'agenda converge vers le voulu.
    alex.retablirAutorisation();
    const reprise = await synchro();
    expect(reprise.etats.alex).toMatchObject({ statut: "ok", crees: 1, modifies: 0, supprimes: 0 });
    expect(reprise.etats.sam).toMatchObject({ statut: "ok", crees: 0, modifies: 0, supprimes: 0 });
    expect(marques(alex).map(cle).sort()).toEqual(reprise.souhaits.alex!.map((s) => s.cle).sort());
    expect(new Set(marques(alex).map(cle)).size).toBe(marques(alex).length);

    // Seuls les événements des nuits des 21 et 22 décembre ont changé, pour chaque adulte.
    for (const [apres, avant] of [
      [parCle(marques(alex)), avantAlex],
      [parCle(marques(sam)), avantSam],
    ] as const) {
      const touches = [...new Set([...apres.keys(), ...avant.keys()])].filter((k) => JSON.stringify(apres.get(k)) !== JSON.stringify(avant.get(k)));
      expect(touches.sort()).toEqual(["nuit:2026-12-21:dom-alex", "nuit:2026-12-21:dom-sam", "nuit:2026-12-22:dom-alex", "nuit:2026-12-22:dom-sam"]);
      expect(apres.get("nuit:2026-12-21:dom-sam")).toMatchObject({ titre: "Nuit : Léo", lieu: "Chez Sam" });
      expect(apres.get("nuit:2026-12-21:dom-alex")).toMatchObject({ titre: "Nuit : Mila, Nina" });
    }

    // Les événements étrangers n'ont jamais bougé.
    const intacts = (a: AgendaFactice, attendus: EvenementAgenda[]) =>
      attendus.every((e) => JSON.stringify(a.contenu(AGENDA).find((x) => x.id === e.id)) === JSON.stringify(e));
    expect(intacts(alex, etrangers.alex)).toBe(true);
    expect(intacts(sam, etrangers.sam)).toBe(true);
    const touchesEtrangers = new Set([...etrangers.alex, ...etrangers.sam].map((e) => e.id));
    const ecritures = [...alex.appels, ...sam.appels].filter((a) => a.action === "mettreAJour" || a.action === "supprimer");
    expect(ecritures.every((a) => !touchesEtrangers.has(a.id!))).toBe(true);
  });
});
