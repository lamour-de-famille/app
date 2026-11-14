import { describe, expect, it } from "vitest";
import { DepotMemoire } from "../domaine/depot-memoire";
import { familleFictive } from "../domaine/fixture-famille";
import { ClientGeminiFactice } from "../ia/client-gemini-factice";
import type { ClientGemini } from "../ia/types";
import { DepotTachesMemoire } from "../taches/depot-memoire";
import { configurationRecapitulatifDepuisEnv } from "./configuration";
import { EnvoyeurPushFactice } from "./envoyeur-factice";
import { PreferencesInvalides, StockagePreferencesMemoire, validerPreferences } from "./preferences";
import { RecapitulatifService, type ResultatRecapitulatif } from "./recapitulatif";
import { FileRegroupementMemoire, StockageAbonnementsMemoire, StockageCompteurMemoire } from "./stockages-memoire";
import type { AbonnementPush } from "./types";

const abo = (n: string): AbonnementPush => ({ endpoint: `https://push.exemple.invalid/${n}`, keys: { p256dh: "cle", auth: "auth" } });

// Samedi 14 novembre 2026 : Paris = UTC+1. Demain = dimanche 15.
const A_19H = new Date("2026-11-14T18:00:00Z"); // 19:00 Paris
const A_20H = new Date("2026-11-14T19:00:00Z"); // 20:00 Paris
const A_21H = new Date("2026-11-14T20:00:00Z");
const LENDEMAIN_20H = new Date("2026-11-15T19:00:00Z");

async function monter(options: { gemini?: ClientGemini; abonne?: string[] } = {}) {
  const horloge = () => A_20H;
  const depot = new DepotMemoire(familleFictive, { maintenant: horloge });
  const taches = new DepotTachesMemoire(familleFictive, { maintenant: horloge });
  const abonnements = new StockageAbonnementsMemoire();
  for (const id of options.abonne ?? ["alex", "sam"]) await abonnements.ajouter(id, abo(id));
  const envoyeur = new EnvoyeurPushFactice();
  const gemini = options.gemini ?? new ClientGeminiFactice();
  const file = new FileRegroupementMemoire();
  const preferences = new StockagePreferencesMemoire();
  const envois = new StockageCompteurMemoire();
  const service = new RecapitulatifService({ depot, taches, abonnements, envoyeur, gemini, file, preferences, envois });
  return { service, depot, taches, abonnements, envoyeur, gemini: gemini as ClientGeminiFactice, file, preferences, envois };
}

const envoyer = (m: { service: RecapitulatifService }, d: Date) =>
  m.service.envoyerRecapitulatifs(d) as Promise<Record<"alex" | "sam", ResultatRecapitulatif>>;

describe("préférences", () => {
  it("valide strictement", () => {
    expect(validerPreferences({ actif: true, heure: "07:05" })).toEqual({ actif: true, heure: "07:05" });
    for (const mauvais of [
      null, [], "20:00", {}, { actif: true }, { heure: "20:00" },
      { actif: "oui", heure: "20:00" }, { actif: true, heure: "24:00" }, { actif: true, heure: "20:60" },
      { actif: true, heure: "8:00" }, { actif: true, heure: "20:00:00" }, { actif: true, heure: " 20:00" },
      { actif: true, heure: "20:00", adulteId: "sam" },
    ]) {
      expect(() => validerPreferences(mauvais), JSON.stringify(mauvais)).toThrow(PreferencesInvalides);
    }
  });

  it("l'heure par défaut vient de la configuration, 20:00 si invalide", () => {
    expect(configurationRecapitulatifDepuisEnv({}).heureParDefaut).toBe("20:00");
    expect(configurationRecapitulatifDepuisEnv({ NOTIFICATIONS_HEURE_RECAP: "18:30" }).heureParDefaut).toBe("18:30");
    expect(configurationRecapitulatifDepuisEnv({ NOTIFICATIONS_HEURE_RECAP: "25:00" }).heureParDefaut).toBe("20:00");
  });

  it("la mémoire garde une copie par adulte", async () => {
    const s = new StockagePreferencesMemoire();
    expect(await s.lire("alex")).toBeNull();
    await s.ecrire("alex", { actif: false, heure: "18:00" });
    expect(await s.lire("alex")).toEqual({ actif: false, heure: "18:00" });
    expect(await s.lire("sam")).toBeNull();
  });
});

describe("RecapitulatifService", () => {
  it("n'envoie rien avant l'heure, puis envoie une seule fois", async () => {
    const m = await monter();
    const envoisAlex = () => m.envoyeur.envois.filter((e) => e.abonnement.endpoint === abo("alex").endpoint);
    await m.depot.definirGarde("alex", { enfantId: "leo", date: "2026-11-15", responsableId: "alex" });
    expect((await envoyer(m, A_19H)).alex).toEqual({ statut: "pas_encore" });
    expect(envoisAlex()).toHaveLength(0);

    const r = await envoyer(m, A_20H);
    expect(r.alex).toMatchObject({ statut: "envoye", source: "gemini", appareils: 1 });
    expect(envoisAlex()).toHaveLength(1);

    expect((await envoyer(m, A_21H)).alex).toEqual({ statut: "deja_envoye" });
    expect((await envoyer(m, A_20H)).alex).toEqual({ statut: "deja_envoye" });
    expect(envoisAlex()).toHaveLength(1);
    expect(m.gemini.appelsRedaction).toHaveLength(2); // un message par adulte, un appel chacun

    // Le lendemain, un nouveau récapitulatif est possible.
    await m.depot.definirGarde("alex", { enfantId: "leo", date: "2026-11-16", responsableId: "alex" });
    expect((await envoyer(m, LENDEMAIN_20H)).alex).toMatchObject({ statut: "envoye" });
    expect(envoisAlex()).toHaveLength(2);
  });

  it("appels parallèles : un seul récapitulatif par jour et par destinataire", async () => {
    const m = await monter();
    await m.depot.definirGarde("alex", { enfantId: "leo", date: "2026-11-15", responsableId: "alex" });
    await Promise.all([A_20H, A_20H, A_21H].map((d) => envoyer(m, d)));
    expect(m.envoyeur.envois.filter((e) => e.abonnement.endpoint === abo("alex").endpoint)).toHaveLength(1);
  });

  it("le récapitulatif ne consomme pas le plafond de notifications mais reste limité à 1 par jour", async () => {
    const m = await monter();
    await m.depot.definirGarde("alex", { enfantId: "leo", date: "2026-11-15", responsableId: "alex" });
    await envoyer(m, A_20H);
    expect(await m.envois.lire("recap:alex:2026-11-14")).toBe(1);
    expect(await m.envois.reserver("recap:alex:2026-11-14", 1)).toBe(false);
    expect(await m.envois.lire("notif:alex:2026-11-14")).toBe(0);
  });

  it("heure réglée par adulte, et activation", async () => {
    const m = await monter();
    await m.depot.definirGarde("alex", { enfantId: "leo", date: "2026-11-15", responsableId: "alex" });
    await m.preferences.ecrire("alex", { actif: true, heure: "19:00" });
    await m.preferences.ecrire("sam", { actif: false, heure: "19:00" });
    const r = await envoyer(m, A_19H);
    expect(r.alex.statut).toBe("envoye");
    expect(r.sam).toEqual({ statut: "desactive" });
    await m.preferences.ecrire("sam", { actif: true, heure: "20:30" });
    expect((await envoyer(m, A_20H)).sam).toEqual({ statut: "pas_encore" });
    expect((await envoyer(m, new Date("2026-11-14T19:30:00Z"))).sam.statut).toBe("envoye");
    expect(m.envoyeur.envois.map((e) => e.abonnement.endpoint)).toEqual([abo("alex").endpoint, abo("sam").endpoint]);
  });

  it("le retard de l'autre adulte n'est ni dans l'entrée de Gemini, ni dans le texte de repli", async () => {
    for (const gemini of [new ClientGeminiFactice(), new ClientGeminiFactice({ erreur: new Error("panne") })]) {
      const m = await monter({ gemini });
      await m.taches.enregistrer("alex", { titre: "RETARD-SAM", assigneId: "sam", echeance: "2026-11-02" });
      await m.taches.enregistrer("sam", { titre: "RETARD-ALEX", assigneId: "alex", echeance: "2026-11-03" });
      await m.taches.enregistrer("sam", { titre: "TACHE-DEMAIN-ALEX", assigneId: "alex", echeance: "2026-11-15" });
      await m.taches.enregistrer("alex", { titre: "TACHE-DEMAIN-SAM", assigneId: "sam", echeance: "2026-11-15" });
      await m.depot.definirGarde("alex", { enfantId: "leo", date: "2026-11-15", responsableId: "alex" });
      await envoyer(m, A_20H);

      const [pourAlex, pourSam] = m.envoyeur.envois.map((e) => e.contenu.corps);
      const contextes = (gemini as ClientGeminiFactice).appelsRedaction.map((a) => a.contexte);
      if (contextes.length) {
        expect(contextes).toHaveLength(2);
        expect(contextes[0]).toContain("TACHE-DEMAIN-ALEX");
        expect(contextes[0]).not.toMatch(/RETARD|TACHE-DEMAIN-SAM/);
        expect(contextes[1]).toContain("TACHE-DEMAIN-SAM");
        expect(contextes[1]).not.toMatch(/RETARD|TACHE-DEMAIN-ALEX/);
      }
      for (const t of [pourAlex, pourSam]) expect(t).not.toMatch(/RETARD/);
      expect(pourAlex).toBeTruthy();
    }
  });

  it("compose présences, gardes, transferts, créneaux et tâches du lendemain, pas ceux d'un autre jour", async () => {
    const m = await monter();
    await m.depot.definirGarde("alex", { enfantId: "leo", date: "2026-11-15", responsableId: "sam" });
    await m.depot.definirPresence("alex", { enfantId: "mila", date: "2026-11-15", lieuId: "dom-sam" });
    await m.depot.enregistrerTransfert("alex", { date: "2026-11-15", heure: "17:30", lieuId: "parc", deposeId: "alex", recupereId: "sam", enfantIds: ["nina"] });
    await m.depot.enregistrerCreneau("alex", { enfantId: "leo", date: "2026-11-15", debut: "10:00", fin: "11:00", libelle: "Natation" });
    await m.depot.enregistrerCreneau("alex", { enfantId: "leo", date: "2026-11-16", debut: "10:00", fin: "11:00", libelle: "AUTRE-JOUR" });
    await m.taches.enregistrer("alex", { titre: "Hebdo", assigneId: "alex", echeance: "2026-11-08", recurrence: { frequence: "hebdomadaire", intervalle: 1 } });
    await envoyer(m, A_20H);
    const c = m.gemini.appelsRedaction[0]!.contexte;
    expect(c).toContain("Léo : garde de Sam");
    expect(c).toContain("Mila dort : Chez Sam");
    expect(c).toContain("17:30 Parc municipal : Alex dépose, Sam récupère (Nina)");
    expect(c).toContain("Léo 10:00-11:00 Natation");
    expect(c).toContain("Tâche : Hebdo");
    expect(c).not.toContain("AUTRE-JOUR");
    expect(m.envoyeur.envois[0]!.contenu.corps.length).toBeLessThanOrEqual(120);
  });

  it("vide la file de regroupement, la fusionne au récapitulatif, et ne la touche pas pour un autre", async () => {
    const m = await monter();
    await m.file.ajouter({ destinataireId: "alex", jour: "2026-11-14", texte: "ECHANGE-PROPOSE" });
    await m.file.ajouter({ destinataireId: "sam", jour: "2026-11-14", texte: "POUR-SAM" });
    await m.preferences.ecrire("sam", { actif: false, heure: "20:00" });
    const r = await envoyer(m, A_20H);
    expect(r.alex.statut).toBe("envoye");
    expect(m.gemini.appelsRedaction[0]!.contexte).toContain("ECHANGE-PROPOSE");
    expect(await m.file.lister("alex")).toEqual([]);
    expect((await m.file.lister("sam")).map((e) => e.texte)).toEqual(["POUR-SAM"]);
  });

  it("repli sans Gemini : texte fixe construit sans IA", async () => {
    const m = await monter({ gemini: new ClientGeminiFactice({ erreur: new Error("plafond") }) });
    await m.depot.enregistrerTransfert("alex", { date: "2026-11-15", heure: "17:30", lieuId: "parc", deposeId: "alex", recupereId: "sam", enfantIds: ["nina"] });
    await m.file.ajouter({ destinataireId: "alex", jour: "2026-11-14", texte: "x" });
    const r = await envoyer(m, A_20H);
    expect(r.alex).toMatchObject({ statut: "envoye", source: "repli", texte: "Demain : 1 transfert, 1 notification regroupée." });
  });

  it("rien à dire : rien n'est envoyé, la place du jour n'est pas prise, la file reste", async () => {
    const m = await monter();
    expect((await envoyer(m, A_20H)).alex).toEqual({ statut: "rien_a_dire" });
    expect(m.envoyeur.envois).toHaveLength(0);
    expect(await m.envois.lire("recap:alex:2026-11-14")).toBe(0);
    await m.depot.definirGarde("alex", { enfantId: "leo", date: "2026-11-15", responsableId: "alex" });
    expect((await envoyer(m, A_21H)).alex.statut).toBe("envoye");
  });

  it("échec d'envoi : la place et la file sont rendues pour le passage suivant", async () => {
    const m = await monter({ abonne: ["alex"] });
    m.envoyeur.enPanne.add(abo("alex").endpoint);
    await m.file.ajouter({ destinataireId: "alex", jour: "2026-11-14", texte: "GARDE-MOI" });
    expect((await envoyer(m, A_20H)).alex).toEqual({ statut: "echec_envoi" });
    expect((await m.file.lister("alex")).map((e) => e.texte)).toEqual(["GARDE-MOI"]);
    m.envoyeur.enPanne.clear();
    expect((await envoyer(m, A_21H)).alex.statut).toBe("envoye");
  });

  it("sans abonnement : rien n'est envoyé ni vidé", async () => {
    const m = await monter({ abonne: ["sam"] });
    await m.file.ajouter({ destinataireId: "alex", jour: "2026-11-14", texte: "x" });
    expect((await envoyer(m, A_20H)).alex).toEqual({ statut: "aucun_abonnement" });
    expect(await m.file.lister("alex")).toHaveLength(1);
  });

  it("un abonnement expiré est retiré", async () => {
    const m = await monter({ abonne: ["alex"] });
    m.envoyeur.expires.add(abo("alex").endpoint);
    await m.file.ajouter({ destinataireId: "alex", jour: "2026-11-14", texte: "x" });
    expect((await envoyer(m, A_20H)).alex.statut).toBe("echec_envoi");
    expect(await m.abonnements.lister("alex")).toEqual([]);
  });

  it("l'erreur d'un adulte n'empêche pas l'autre", async () => {
    const m = await monter();
    await m.depot.definirGarde("alex", { enfantId: "leo", date: "2026-11-15", responsableId: "alex" });
    m.preferences.lire = async (id: string) => {
      if (id === "alex") throw new Error("boum");
      return null;
    };
    const r = await envoyer(m, A_20H);
    expect(r.alex).toEqual({ statut: "erreur" });
    expect(r.sam.statut).toBe("envoye");
  });

  it("la nuit et l'heure d'été : l'heure se lit à Paris", async () => {
    const m = await monter();
    await m.depot.definirGarde("alex", { enfantId: "leo", date: "2026-07-15", responsableId: "alex" });
    // 18:00Z en été = 20:00 Paris (UTC+2).
    expect((await envoyer(m, new Date("2026-07-14T17:59:00Z"))).alex.statut).toBe("pas_encore");
    expect((await envoyer(m, new Date("2026-07-14T18:00:00Z"))).alex.statut).toBe("envoye");
  });
});
