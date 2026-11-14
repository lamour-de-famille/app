import { describe, expect, it } from "vitest";
import { ClientGeminiFactice } from "../ia/client-gemini-factice";
import { PlafondAtteint } from "../ia/plafond";
import type { ClientGemini } from "../ia/types";
import { configurationNotificationsDepuisEnv } from "./configuration";
import { EnvoyeurPushFactice } from "./envoyeur-factice";
import { LONGUEUR_MAX_TEXTE, ServiceNotifications, TEXTE_DE_REPLI } from "./service";
import { FileRegroupementMemoire, StockageAbonnementsMemoire, StockageCompteurMemoire } from "./stockages-memoire";
import type { AbonnementPush } from "./types";

const abo = (n: string): AbonnementPush => ({ endpoint: `https://push.exemple.invalid/${n}`, keys: { p256dh: "cle", auth: "auth" } });

function monter(options: { gemini?: ClientGemini; date?: { v: Date }; max?: number } = {}) {
  const date = options.date ?? { v: new Date("2026-11-14T10:00:00Z") };
  const abonnements = new StockageAbonnementsMemoire();
  const envoyeur = new EnvoyeurPushFactice();
  const file = new FileRegroupementMemoire();
  const gemini = options.gemini ?? new ClientGeminiFactice();
  const marques: string[] = [];
  const service = new ServiceNotifications({
    abonnements,
    envoyeur,
    gemini,
    compteur: new StockageCompteurMemoire(),
    file,
    configuration: options.max ? { maxParJour: options.max } : undefined,
    maintenant: () => date.v,
    marquerNotifie: async (d, e) => void marques.push(`${d}:${e}`),
  });
  return { service, abonnements, envoyeur, file, date, marques };
}

describe("abonnements", () => {
  it("un adulte a plusieurs appareils, un appareil n'appartient qu'à un adulte", async () => {
    const s = new StockageAbonnementsMemoire();
    await s.ajouter("alex", abo("tel"));
    await s.ajouter("alex", abo("tablette"));
    await s.ajouter("sam", abo("tel"));
    expect((await s.lister("alex")).map((a) => a.endpoint)).toEqual([abo("tablette").endpoint]);
    expect(await s.lister("sam")).toHaveLength(1);
  });
});

describe("ServiceNotifications", () => {
  it("envoie à tous les appareils du destinataire seulement", async () => {
    const { service, abonnements, envoyeur } = monter();
    await abonnements.ajouter("alex", abo("a1"));
    await abonnements.ajouter("alex", abo("a2"));
    await abonnements.ajouter("sam", abo("s1"));
    const r = await service.notifier({ destinataireId: "alex", sujet: "nouvelle tâche pour Léo" });
    expect(r).toMatchObject({ statut: "envoyee", source: "gemini", appareils: 2 });
    expect(envoyeur.envois.map((e) => e.abonnement.endpoint).sort()).toEqual([abo("a1").endpoint, abo("a2").endpoint]);
  });

  it("refuse un événement destiné à un autre adulte", async () => {
    const { service, abonnements, envoyeur } = monter();
    await abonnements.ajouter("sam", abo("s1"));
    await expect(
      service.notifier({ destinataireId: "sam", evenement: { id: "e1", entreeId: "t1", destinataireId: "alex", quand: "2026-11-14T09:00:00Z" } }),
    ).rejects.toThrow();
    expect(envoyeur.envois).toHaveLength(0);
  });

  it("marque l'événement notifié après envoi", async () => {
    const { service, abonnements, marques } = monter();
    await abonnements.ajouter("alex", abo("a1"));
    await service.notifier({ destinataireId: "alex", evenement: { id: "e1", entreeId: "t1", destinataireId: "alex", quand: "2026-11-14T09:00:00Z" } });
    expect(marques).toEqual(["alex:e1"]);
  });

  it("sans abonnement : rien envoyé, rien compté, rien marqué", async () => {
    const { service, marques } = monter({ max: 1 });
    expect(await service.notifier({ destinataireId: "alex" })).toEqual({ statut: "aucun_abonnement" });
    expect(await service.notifier({ destinataireId: "alex" })).toEqual({ statut: "aucun_abonnement" });
    expect(marques).toEqual([]);
  });

  it("retire l'abonnement expiré (410) et garde les autres", async () => {
    const { service, abonnements, envoyeur } = monter();
    await abonnements.ajouter("alex", abo("mort"));
    await abonnements.ajouter("alex", abo("vivant"));
    envoyeur.expires.add(abo("mort").endpoint);
    const r = await service.notifier({ destinataireId: "alex" });
    expect(r).toMatchObject({ statut: "envoyee", appareils: 1 });
    expect((await abonnements.lister("alex")).map((a) => a.endpoint)).toEqual([abo("vivant").endpoint]);
  });

  it("panne transitoire sur tous les appareils : échec, abonnement gardé, compteur rendu", async () => {
    const { service, abonnements, envoyeur } = monter({ max: 1 });
    await abonnements.ajouter("alex", abo("a1"));
    envoyeur.enPanne.add(abo("a1").endpoint);
    expect(await service.notifier({ destinataireId: "alex" })).toEqual({ statut: "echec_envoi" });
    expect(await abonnements.lister("alex")).toHaveLength(1);
    envoyeur.enPanne.clear();
    expect((await service.notifier({ destinataireId: "alex" })).statut).toBe("envoyee");
  });

  describe("texte", () => {
    it("tronque à 120 caractères", async () => {
      const gemini = { rediger: async () => ({ texte: "mot ".repeat(100) }), traiterDictee: async () => { throw new Error("non"); } } as ClientGemini;
      const { service, abonnements, envoyeur } = monter({ gemini });
      await abonnements.ajouter("alex", abo("a1"));
      await service.notifier({ destinataireId: "alex" });
      const corps = envoyeur.envois[0]!.contenu.corps;
      expect(corps.length).toBeLessThanOrEqual(LONGUEUR_MAX_TEXTE);
    });

    it("repli fixe si Gemini échoue", async () => {
      const { service, abonnements, envoyeur } = monter({ gemini: new ClientGeminiFactice({ erreur: new Error("panne") }) });
      await abonnements.ajouter("alex", abo("a1"));
      const r = await service.notifier({ destinataireId: "alex" });
      expect(r).toMatchObject({ statut: "envoyee", source: "repli", texte: TEXTE_DE_REPLI });
      expect(envoyeur.envois[0]!.contenu.corps).toBe(TEXTE_DE_REPLI);
    });

    it("repli fixe si le plafond IA est atteint", async () => {
      const { service, abonnements } = monter({ gemini: new ClientGeminiFactice({ erreur: new PlafondAtteint("jour") }) });
      await abonnements.ajouter("alex", abo("a1"));
      expect(await service.notifier({ destinataireId: "alex" })).toMatchObject({ source: "repli" });
    });

    it("repli si Gemini rend un texte vide", async () => {
      const gemini = { rediger: async () => ({ texte: "   " }), traiterDictee: async () => { throw new Error("non"); } } as ClientGemini;
      const { service, abonnements } = monter({ gemini });
      await abonnements.ajouter("alex", abo("a1"));
      expect(await service.notifier({ destinataireId: "alex" })).toMatchObject({ source: "repli" });
    });
  });

  describe("plafond de 10 par jour et par destinataire", () => {
    it("la 10e passe, la 11e est regroupée sans envoi", async () => {
      const { service, abonnements, envoyeur, file, marques } = monter();
      await abonnements.ajouter("alex", abo("a1"));
      for (let i = 1; i <= 10; i++) {
        expect((await service.notifier({ destinataireId: "alex" })).statut).toBe("envoyee");
      }
      const r = await service.notifier({
        destinataireId: "alex",
        evenement: { id: "e11", entreeId: "t1", destinataireId: "alex", quand: "2026-11-14T09:00:00Z" },
      });
      expect(r.statut).toBe("regroupee");
      expect(envoyeur.envois).toHaveLength(10);
      expect(await file.lister("alex")).toEqual([expect.objectContaining({ jour: "2026-11-14", evenementId: "e11" })]);
      expect(marques).toEqual(["alex:e11"]);
    });

    it("la valeur par défaut est 10 et la configuration la règle", () => {
      expect(configurationNotificationsDepuisEnv({})).toEqual({ maxParJour: 10 });
      expect(configurationNotificationsDepuisEnv({ NOTIFICATIONS_MAX_PAR_JOUR: "3" })).toEqual({ maxParJour: 3 });
      expect(configurationNotificationsDepuisEnv({ NOTIFICATIONS_MAX_PAR_JOUR: "0" })).toEqual({ maxParJour: 10 });
      expect(configurationNotificationsDepuisEnv({ NOTIFICATIONS_MAX_PAR_JOUR: "abc" })).toEqual({ maxParJour: 10 });
    });

    it("le compteur est par destinataire", async () => {
      const { service, abonnements, file } = monter();
      await abonnements.ajouter("alex", abo("a1"));
      await abonnements.ajouter("sam", abo("s1"));
      for (let i = 0; i < 11; i++) await service.notifier({ destinataireId: "alex" });
      expect((await service.notifier({ destinataireId: "sam" })).statut).toBe("envoyee");
      expect(await file.lister("sam")).toHaveLength(0);
      expect(await file.lister("alex")).toHaveLength(1);
    });

    it("repart à zéro le jour suivant (Europe/Paris)", async () => {
      const { service, abonnements, date } = monter();
      await abonnements.ajouter("alex", abo("a1"));
      date.v = new Date("2026-11-14T22:30:00Z"); // 23:30 à Paris
      for (let i = 0; i < 10; i++) await service.notifier({ destinataireId: "alex" });
      expect((await service.notifier({ destinataireId: "alex" })).statut).toBe("regroupee");
      date.v = new Date("2026-11-14T23:30:00Z"); // 00:30 le 15 à Paris
      expect((await service.notifier({ destinataireId: "alex" })).statut).toBe("envoyee");
    });

    it("des appels parallèles ne dépassent pas 10", async () => {
      const { service, abonnements, envoyeur, file } = monter();
      await abonnements.ajouter("alex", abo("a1"));
      const res = await Promise.all(Array.from({ length: 25 }, () => service.notifier({ destinataireId: "alex" })));
      expect(res.filter((r) => r.statut === "envoyee")).toHaveLength(10);
      expect(res.filter((r) => r.statut === "regroupee")).toHaveLength(15);
      expect(envoyeur.envois).toHaveLength(10);
      expect(await file.lister("alex")).toHaveLength(15);
    });

    it("un appelant ne peut pas relever le plafond : aucun paramètre ne l'accepte", async () => {
      const { service, abonnements } = monter();
      await abonnements.ajouter("alex", abo("a1"));
      for (let i = 0; i < 10; i++) await service.notifier({ destinataireId: "alex" });
      const demande = { destinataireId: "alex", max: 1000, maxParJour: 1000 } as unknown as Parameters<typeof service.notifier>[0];
      expect((await service.notifier(demande)).statut).toBe("regroupee");
    });
  });
});
