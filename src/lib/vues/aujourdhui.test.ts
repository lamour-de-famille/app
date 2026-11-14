import { describe, expect, it } from "vitest";
import { familleFictive } from "@/lib/domaine/fixture-famille";
import type { Garde, Presence, Transfert } from "@/lib/domaine/types";
import { choisirVueAujourdhui } from "./aujourdhui";

const JOUR = "2026-11-13";
const garde = (enfantId: string, responsableId: string, date = JOUR): Garde => ({ enfantId, date, responsableId });
const presence = (enfantId: string, lieuId: string, date = JOUR): Presence => ({ enfantId, date, lieuId });
const transfert = (id: string, date: string, heure: string, extra: Partial<Transfert> = {}): Transfert => ({
  id,
  date,
  heure,
  lieuId: "ecole",
  deposeId: "alex",
  recupereId: "sam",
  enfantIds: ["leo"],
  ...extra,
});

const base = {
  famille: familleFictive,
  date: JOUR,
  gardes: [garde("leo", "alex"), garde("mila", "alex"), garde("nina", "sam")],
  presences: [presence("leo", "dom-alex"), presence("mila", "dom-sam"), presence("nina", "grands-parents")],
  transferts: [] as Transfert[],
};

describe("choisirVueAujourdhui : présence", () => {
  it("donne plein / contour / gris selon l'adulte connecté", () => {
    const alex = choisirVueAujourdhui({ ...base, adulteId: "alex" });
    expect(alex.enfants.map((e) => e.etat)).toEqual(["adulte-connecte", "autre-adulte", "tiers"]);
    const sam = choisirVueAujourdhui({ ...base, adulteId: "sam" });
    expect(sam.enfants.map((e) => e.etat)).toEqual(["autre-adulte", "adulte-connecte", "tiers"]);
  });

  it("distingue la garde de la présence et signale la divergence", () => {
    const vue = choisirVueAujourdhui({ ...base, adulteId: "alex" });
    const [leo, mila, nina] = vue.enfants;
    expect(leo).toMatchObject({ lieu: "Chez Alex", garde: "vous", divergence: false });
    expect(mila).toMatchObject({ lieu: "Chez Sam", garde: "vous", divergence: true });
    expect(nina).toMatchObject({ lieu: "Chez les grands-parents", garde: "Sam", divergence: true });
  });

  it("nomme l'autre adulte quand c'est lui qui a la garde", () => {
    const vue = choisirVueAujourdhui({ ...base, adulteId: "sam" });
    expect(vue.enfants[0]?.garde).toBe("Alex");
    expect(vue.enfants[2]?.garde).toBe("vous");
  });

  it("gère l'absence de données sans inventer", () => {
    const vue = choisirVueAujourdhui({ ...base, adulteId: "alex", gardes: [], presences: [] });
    expect(vue.enfants[0]).toMatchObject({ lieu: null, garde: null, etat: "tiers", divergence: false });
  });

  it("ignore les autres jours", () => {
    const vue = choisirVueAujourdhui({
      ...base,
      adulteId: "alex",
      presences: [presence("leo", "dom-sam", "2026-11-12")],
    });
    expect(vue.enfants[0]?.lieu).toBeNull();
  });

  it("refuse un adulte inconnu", () => {
    expect(() => choisirVueAujourdhui({ ...base, adulteId: "inconnu" })).toThrow();
  });
});

describe("choisirVueAujourdhui : prochain transfert", () => {
  it("prend le premier transfert à partir d'aujourd'hui, par date puis heure", () => {
    const vue = choisirVueAujourdhui({
      ...base,
      adulteId: "alex",
      transferts: [
        transfert("passe", "2026-11-12", "08:00"),
        transfert("tard", JOUR, "18:00"),
        transfert("tot", JOUR, "08:30"),
        transfert("demain", "2026-11-14", "07:00"),
      ],
    });
    expect(vue.prochainTransfert?.id).toBe("tot");
  });

  it("décrit lieu, qui dépose et qui récupère du point de vue de l'adulte", () => {
    const t = transfert("t", "2026-11-14", "17:30", { enfantIds: ["leo", "mila"] });
    const vue = choisirVueAujourdhui({ ...base, adulteId: "alex", transferts: [t] });
    expect(vue.prochainTransfert).toMatchObject({
      date: "2026-11-14",
      heure: "17:30",
      lieu: "École Exemple",
      depose: "vous",
      recupere: "Sam",
      enfants: ["Léo", "Mila"],
      aujourdhui: false,
    });
    const sam = choisirVueAujourdhui({ ...base, adulteId: "sam", transferts: [t] });
    expect(sam.prochainTransfert).toMatchObject({ depose: "Alex", recupere: "vous" });
  });

  it("vaut null sans transfert à venir", () => {
    const vue = choisirVueAujourdhui({
      ...base,
      adulteId: "alex",
      transferts: [transfert("passe", "2026-11-12", "08:00")],
    });
    expect(vue.prochainTransfert).toBeNull();
  });

  it("propose des affaires à emmener pour les enfants du transfert, avec des clés stables", () => {
    const t = transfert("t1", "2026-11-14", "17:30", { enfantIds: ["leo", "nina"] });
    const vue = choisirVueAujourdhui({ ...base, adulteId: "alex", transferts: [t] });
    const cles = vue.affaires.map((a) => a.cle);
    expect(new Set(cles).size).toBe(cles.length);
    expect(vue.affaires.length).toBeGreaterThan(0);
    expect(vue.affaires.every((a) => a.cle.startsWith("t1|"))).toBe(true);
    expect(vue.affaires.some((a) => a.enfant === "Léo")).toBe(true);
    expect(vue.affaires.some((a) => a.enfant === "Nina")).toBe(true);
    expect(vue.affaires.some((a) => a.enfant === "Mila")).toBe(false);
  });

  it("n'a aucune affaire sans transfert", () => {
    expect(choisirVueAujourdhui({ ...base, adulteId: "alex" }).affaires).toEqual([]);
  });
});
