import { describe, expect, it } from "vitest";
import { familleFictive } from "@/lib/domaine/fixture-famille";
import type { DemandeEchange, Garde, Presence, Transfert } from "@/lib/domaine/types";
import { choisirVuePlanning } from "./planning";

const presence = (enfantId: string, date: string, lieuId: string): Presence => ({ enfantId, date, lieuId });
const garde = (enfantId: string, date: string, responsableId: string): Garde => ({ enfantId, date, responsableId });
const demande = (id: string, auteurId: string, statut: DemandeEchange["statut"] = "proposee"): DemandeEchange => ({
  id,
  statut,
  auteurId,
  responsableId: auteurId,
  enfantIds: ["leo"],
  jours: ["2026-11-20", "2026-11-21"],
  creeLe: "2026-11-13T10:00:00.000Z",
});

const base = {
  famille: familleFictive,
  adulteId: "alex",
  annee: 2026,
  mois: 11,
  jourChoisi: "2026-11-13",
  presences: [
    presence("leo", "2026-11-13", "dom-alex"),
    presence("mila", "2026-11-13", "dom-sam"),
    presence("nina", "2026-11-13", "grands-parents"),
    presence("leo", "2026-11-14", "dom-sam"),
  ],
  gardes: [garde("leo", "2026-11-13", "alex"), garde("mila", "2026-11-13", "sam")],
  transferts: [] as Transfert[],
  demandes: [] as DemandeEchange[],
};

const cellule = (v: ReturnType<typeof choisirVuePlanning>, date: string) =>
  v.semaines.flat().find((c) => c.date === date)!;

describe("choisirVuePlanning : grille", () => {
  it("donne un repère par enfant avec forme, marqueur et libellé accessible", () => {
    const c = cellule(choisirVuePlanning(base), "2026-11-13");
    expect(c.reperes.map((r) => r.etat)).toEqual(["adulte-connecte", "autre-adulte", "tiers"]);
    expect(c.reperes.map((r) => r.forme)).toEqual(["plein", "contour", "tiers"]);
    expect(c.reperes[0]).toMatchObject({ prenom: "Léo", libelle: "Léo, chez vous", marqueur: "✓" });
    expect(c.reperes[1]!.libelle).toBe("Mila, chez l'autre adulte");
    expect(c.reperes[2]!.libelle).toBe("Nina, chez un tiers");
  });

  it("change de point de vue avec l'adulte connecté", () => {
    const c = cellule(choisirVuePlanning({ ...base, adulteId: "sam" }), "2026-11-13");
    expect(c.reperes.map((r) => r.etat)).toEqual(["autre-adulte", "adulte-connecte", "tiers"]);
  });

  it("n'invente rien quand la présence est inconnue", () => {
    const c = cellule(choisirVuePlanning(base), "2026-11-15");
    expect(c.reperes.every((r) => r.etat === null && r.libelle.endsWith("non renseigné"))).toBe(true);
    expect(c.libelle).toContain("15 novembre");
    expect(c.libelle).toContain("aucune présence renseignée");
  });

  it("décrit la cellule en une phrase pour les lecteurs d'écran, jour choisi signalé", () => {
    const v = choisirVuePlanning(base);
    expect(cellule(v, "2026-11-13").libelle).toBe(
      "13 novembre : Léo, chez vous ; Mila, chez l'autre adulte ; Nina, chez un tiers",
    );
    expect(cellule(v, "2026-11-13").choisi).toBe(true);
    expect(cellule(v, "2026-11-14").choisi).toBe(false);
  });

  it("garde la grille du mois et le titre", () => {
    const v = choisirVuePlanning(base);
    expect(v.titre).toBe("novembre 2026");
    expect(v.semaines).toHaveLength(6);
    expect(v.precedent).toBe("2026-10");
    expect(v.suivant).toBe("2026-12");
  });
});

describe("choisirVuePlanning : détail du jour", () => {
  it("réutilise la distinction présence / garde pour le jour choisi", () => {
    const d = choisirVuePlanning(base).detail;
    expect(d.date).toBe("2026-11-13");
    expect(d.enfants[1]).toMatchObject({ prenom: "Mila", lieu: "Chez Sam", garde: "Sam", divergence: false });
    expect(d.enfants[0]).toMatchObject({ lieu: "Chez Alex", garde: "vous" });
  });

  it("liste uniquement les transferts du jour choisi", () => {
    const t = (id: string, date: string): Transfert => ({
      id,
      date,
      heure: "17:30",
      lieuId: "ecole",
      deposeId: "alex",
      recupereId: "sam",
      enfantIds: ["leo"],
    });
    const d = choisirVuePlanning({ ...base, transferts: [t("a", "2026-11-13"), t("b", "2026-11-14")] }).detail;
    expect(d.transferts.map((x) => x.id)).toEqual(["a"]);
    expect(d.transferts[0]).toMatchObject({ lieu: "École du Tilleul", depose: "vous", recupere: "Sam" });
  });
});

describe("choisirVuePlanning : demandes", () => {
  it("ne propose de répondre qu'aux demandes en attente venant de l'autre adulte", () => {
    const v = choisirVuePlanning({
      ...base,
      demandes: [
        demande("recue", "sam"),
        demande("envoyee", "alex"),
        demande("close", "sam", "acceptee"),
      ],
    });
    expect(v.demandesRecues.map((d) => d.id)).toEqual(["recue"]);
    expect(v.demandesRecues[0]).toMatchObject({
      auteur: "Sam",
      enfants: ["Léo"],
      jours: ["2026-11-20", "2026-11-21"],
      responsable: "Sam",
    });
    expect(v.demandesEnvoyees.map((d) => d.id)).toEqual(["envoyee"]);
  });

  it("nomme « vous » quand la garde demandée revient à l'adulte connecté", () => {
    const d: DemandeEchange = { ...demande("r", "sam"), responsableId: "alex" };
    expect(choisirVuePlanning({ ...base, demandes: [d] }).demandesRecues[0]!.responsable).toBe("vous");
  });
});
