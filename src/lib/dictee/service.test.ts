import { describe, expect, it } from "vitest";
import { DepotMemoire } from "../domaine/depot-memoire";
import { familleFictive } from "../domaine/fixture-famille";
import { ClientGeminiFactice } from "../ia/client-gemini-factice";
import { ClientGeminiPlafonne, PlafondAtteint, PlafondIA, StockageUsageIAMemoire } from "../ia/plafond";
import { SEUILS_PAR_DEFAUT } from "../ia/configuration";
import { SortieDicteeInvalide } from "../ia/sortie-dictee";
import type { ClientGemini, SortieDictee } from "../ia/types";
import type { DemandeNotification } from "../notifications/types";
import { DepotTachesMemoire } from "../taches";
import { NotesFamilleMemoire } from "./notes";
import { DicteeService, type DependancesDictee } from "./service";
import { StockagePropositionsMemoire } from "./stockage-propositions";
import { AudioInvalide, ChoixInvalide, PropositionIntrouvable } from "./types";

const AUDIO = { octets: new Uint8Array([1, 2, 3]), mimeType: "audio/webm;codecs=opus" };
const MAINTENANT = new Date("2026-11-14T10:00:00Z");

const SORTIE: SortieDictee = {
  transcription: "Sam prend Léo mardi, rendez-vous dentiste pour Mila, penser aux chaussons.",
  taches: [
    { titre: "Acheter des chaussons", assigneId: "sam", echeance: "2026-11-20" },
    { titre: "Ranger le garage", assigneId: "alex" },
    { titre: "Sortir les poubelles", echeance: "2026-11-16", recurrence: "annuelle" },
  ],
  rendezVous: [
    { titre: "Dentiste", debut: "2026-11-18T16:30", lieu: "Cabinet", enfantIds: ["mila"] },
    { titre: "Réunion de rentrée", debut: "2026-11-19T18:00", fin: "2026-11-19T19:00" },
  ],
  notes: [{ texte: "Mila a besoin de nouvelles bottes", enfantId: "mila" }],
};

function monter(options: { sortie?: SortieDictee; gemini?: ClientGemini; extra?: Partial<DependancesDictee>; temps?: { v: Date } } = {}) {
  const temps = options.temps ?? { v: MAINTENANT };
  const depotFamille = new DepotMemoire(familleFictive);
  const depotTaches = new DepotTachesMemoire(familleFictive, { maintenant: () => temps.v });
  const notes = new NotesFamilleMemoire();
  const factice = new ClientGeminiFactice({ sortie: options.sortie ?? SORTIE });
  const notifs: DemandeNotification[] = [];
  const synchros: string[] = [];
  const service = new DicteeService({
    depotFamille,
    depotTaches,
    notes,
    propositions: new StockagePropositionsMemoire(),
    gemini: options.gemini ?? factice,
    notifications: { notifier: async (d) => (notifs.push(d), { statut: "envoyee", texte: "", source: "repli", appareils: 1 }) },
    synchroApresModification: async (a) => void synchros.push(`agenda:${a}`),
    synchroTaches: async (a) => void synchros.push(`taches:${a}`),
    maintenant: () => temps.v,
    ...options.extra,
  });
  return { service, depotFamille, depotTaches, notes, factice, notifs, synchros, temps };
}

async function ecritures(m: ReturnType<typeof monter>) {
  return {
    journal: (await m.depotFamille.lireJournal()).length,
    taches: (await m.depotTaches.lister()).length,
    notes: (await m.notes.lister()).length,
  };
}

describe("proposer", () => {
  it("rend une proposition complète et n'écrit rien", async () => {
    const m = monter();
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    expect(p.transcription).toBe(SORTIE.transcription);
    expect(p.taches).toHaveLength(3);
    expect(p.rendezVous).toHaveLength(2);
    expect(p.notes).toHaveLength(1);
    expect(p.id).toMatch(/\S{8,}/);
    expect(p.avertissements.join(" ")).toMatch(/sans responsable/);
    expect(p.avertissements.join(" ")).toMatch(/annuelle/);
    expect(p.avertissements.join(" ")).toMatch(/aucun enfant/);
    expect(await ecritures(m)).toEqual({ journal: 0, taches: 0, notes: 0 });
    expect(m.notifs).toEqual([]);
    expect(m.synchros).toEqual([]);
  });

  it("lit la famille en base et ne transmet à Gemini que l'audio et la famille (aucune tâche existante)", async () => {
    const m = monter();
    await m.depotTaches.enregistrer("sam", { titre: "Retard privé de Sam", assigneId: "sam", echeance: "2026-11-01" });
    await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    const [appel] = m.factice.appelsDictee;
    expect(appel?.famille).toEqual(familleFictive);
    expect(appel?.adulteId).toBe("alex");
    expect(appel?.audio.mimeType).toBe("audio/webm");
    expect(JSON.stringify(appel)).not.toContain("Retard privé");
  });

  it("la proposition ne contient aucune tâche existante : le retard de l'autre n'est pas exposé", async () => {
    const m = monter({ sortie: { transcription: "rien", taches: [], rendezVous: [], notes: [] } });
    await m.depotTaches.enregistrer("sam", { titre: "Retard privé de Sam", assigneId: "sam", echeance: "2026-11-01" });
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    expect(JSON.stringify(p)).not.toContain("Retard privé");
    expect(p.avertissements).toEqual(["Rien à ranger dans cette dictée."]);
  });

  it("sortie Gemini invalide : rien n'est produit ni écrit", async () => {
    const mauvaise = { transcription: "x", taches: [{ titre: "t", assigneId: "inconnu" }], rendezVous: [], notes: [] };
    const m = monter({ sortie: mauvaise });
    await expect(m.service.proposer({ auteurId: "alex", audio: AUDIO })).rejects.toBeInstanceOf(SortieDicteeInvalide);
    expect(await ecritures(m)).toEqual({ journal: 0, taches: 0, notes: 0 });
  });

  it("un client qui laisserait passer une sortie hors schéma est rattrapé par le service", async () => {
    const laxiste: ClientGemini = {
      traiterDictee: async () => ({ resultat: { transcription: "x", taches: [{ titre: "t", creeParId: "sam" }], rendezVous: [], notes: [] } as unknown as SortieDictee }),
      rediger: async () => ({ texte: "" }),
    };
    const m = monter({ gemini: laxiste });
    await expect(m.service.proposer({ auteurId: "alex", audio: AUDIO })).rejects.toBeInstanceOf(SortieDicteeInvalide);
  });

  it("plafond IA atteint : coupure propre, aucune écriture", async () => {
    const usage = new StockageUsageIAMemoire();
    const plafond = new PlafondIA(usage, { ...SEUILS_PAR_DEFAUT, maxRequetesJour: 1 }, () => MAINTENANT);
    const gemini = new ClientGeminiPlafonne(new ClientGeminiFactice({ sortie: SORTIE }), plafond);
    const m = monter({ gemini });
    await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    const e = await m.service.proposer({ auteurId: "alex", audio: AUDIO }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(PlafondAtteint);
    expect((e as Error).message).toMatch(/Limite quotidienne/);
    expect(await ecritures(m)).toEqual({ journal: 0, taches: 0, notes: 0 });
  });

  it("audio vide, trop gros ou de mauvais type : refusé avant tout appel", async () => {
    const m = monter({ extra: { maxOctetsAudio: 4 } });
    await expect(m.service.proposer({ auteurId: "alex", audio: { octets: new Uint8Array(), mimeType: "audio/webm" } })).rejects.toMatchObject({ raison: "vide" });
    await expect(m.service.proposer({ auteurId: "alex", audio: { octets: new Uint8Array(5), mimeType: "audio/webm" } })).rejects.toMatchObject({ raison: "trop_gros" });
    await expect(m.service.proposer({ auteurId: "alex", audio: { octets: new Uint8Array(2), mimeType: "text/html" } })).rejects.toBeInstanceOf(AudioInvalide);
    expect(m.factice.appelsDictee).toHaveLength(0);
  });

  it("auteur inconnu refusé avant tout appel", async () => {
    const m = monter();
    await expect(m.service.proposer({ auteurId: "intrus", audio: AUDIO })).rejects.toThrow(/Auteur inconnu/);
    expect(m.factice.appelsDictee).toHaveLength(0);
  });
});

describe("valider", () => {
  it("écrit exactement les éléments retenus, rien d'autre", async () => {
    const m = monter();
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    const r = await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [1], rendezVous: [0], notes: [] } });
    expect(r).toMatchObject({ taches: 1, creneaux: 1, notes: 0, rendezVousEnNote: 0, notifie: false });
    const taches = await m.depotTaches.lister();
    expect(taches.map((t) => t.titre)).toEqual(["Ranger le garage"]);
    expect(taches[0]).toMatchObject({ assigneId: "alex", creeParId: "alex" });
    const creneaux = await m.depotFamille.listerCreneaux();
    expect(creneaux).toHaveLength(1);
    expect(creneaux[0]).toMatchObject({ enfantId: "mila", date: "2026-11-18", debut: "16:30", fin: "17:30", libelle: "Dentiste (Cabinet)" });
    expect(await m.notes.lister()).toEqual([]);
  });

  it("ne retenir rien consomme la proposition sans rien écrire", async () => {
    const m = monter();
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    expect(await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: {} })).toMatchObject({ taches: 0, creneaux: 0, notes: 0, notifie: false });
    expect(await ecritures(m)).toEqual({ journal: 0, taches: 0, notes: 0 });
    await expect(m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [0] } })).rejects.toBeInstanceOf(PropositionIntrouvable);
  });

  it("une proposition ne se valide qu'une fois, même en parallèle", async () => {
    const m = monter();
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    const essais = await Promise.allSettled([
      m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [1] } }),
      m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [1] } }),
    ]);
    expect(essais.filter((e) => e.status === "fulfilled")).toHaveLength(1);
    expect(essais.find((e) => e.status === "rejected")).toMatchObject({ reason: expect.any(PropositionIntrouvable) });
    expect(await m.depotTaches.lister()).toHaveLength(1);
  });

  it("un autre auteur est refusé, sans brûler la proposition", async () => {
    const m = monter();
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    await expect(m.service.valider({ auteurId: "sam", propositionId: p.id, retenus: { taches: [0, 1] } })).rejects.toBeInstanceOf(PropositionIntrouvable);
    expect(await ecritures(m)).toEqual({ journal: 0, taches: 0, notes: 0 });
    expect(m.notifs).toEqual([]);
    await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [1] } });
    expect(await m.depotTaches.lister()).toHaveLength(1);
  });

  it("identifiant inventé ou expiré : refusé", async () => {
    const m = monter();
    await expect(m.service.valider({ auteurId: "alex", propositionId: "inventee", retenus: { taches: [0] } })).rejects.toBeInstanceOf(PropositionIntrouvable);
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    m.temps.v = new Date(MAINTENANT.getTime() + 16 * 60 * 1000);
    await expect(m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [1] } })).rejects.toBeInstanceOf(PropositionIntrouvable);
    expect(await ecritures(m)).toEqual({ journal: 0, taches: 0, notes: 0 });
  });

  it("une version modifiée est revalidée : identifiant inconnu, champ inconnu ou date invalide refusés, proposition conservée", async () => {
    const m = monter();
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    const mauvais = [
      { taches: [{ titre: "x", assigneId: "intrus" }] },
      { taches: [{ titre: "x", assigneId: "sam", creeParId: "alex" }] },
      { taches: [{ titre: "x", echeance: "2026-02-31" }] },
      { rendezVous: [{ titre: "x", debut: "2026-11-18T16:30", enfantIds: ["inconnu"] }] },
      { notes: [{ texte: "x", enfantId: "inconnu" }] },
      { taches: [99] },
      { taches: [-1] },
      { taches: [1.5] },
    ];
    for (const retenus of mauvais) {
      await expect(m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: retenus as never })).rejects.toBeInstanceOf(ChoixInvalide);
    }
    expect(await ecritures(m)).toEqual({ journal: 0, taches: 0, notes: 0 });
    // Un choix invalide ne brûle pas la proposition.
    await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [1] } });
    expect(await m.depotTaches.lister()).toHaveLength(1);
  });

  it("une version modifiée valide est écrite à la place de l'originale", async () => {
    const m = monter();
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [{ titre: "Acheter des chaussons rouges", assigneId: "alex" }, 1, 1], notes: [{ texte: "Texte corrigé" }] } });
    expect((await m.depotTaches.lister()).map((t) => t.titre)).toEqual(["Acheter des chaussons rouges", "Ranger le garage"]);
    expect((await m.notes.lister()).map((n) => n.texte)).toEqual(["Texte corrigé"]);
  });

  it("notifie l'autre adulte seulement pour ce qui le concerne, avec un sujet sobre", async () => {
    const m = monter();
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    const r = await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [0, 1], rendezVous: [0], notes: [0] } });
    expect(r.notifie).toBe(true);
    expect(m.notifs).toEqual([{ destinataireId: "sam", sujet: "Alex vous a confié une tâche." }]);
    expect(JSON.stringify(m.notifs)).not.toContain("chaussons");
  });

  it("aucune notification si rien n'est confié à l'autre adulte (tâche pour soi, rendez-vous, notes)", async () => {
    const m = monter();
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [1, 2], rendezVous: [0, 1], notes: [0] } });
    expect(m.notifs).toEqual([]);
  });

  it("l'inverse : Sam qui confie une tâche à Alex notifie Alex", async () => {
    const m = monter({ sortie: { transcription: "t", taches: [{ titre: "Appeler l'école", assigneId: "alex" }, { titre: "Courses", assigneId: "alex" }], rendezVous: [], notes: [] } });
    const p = await m.service.proposer({ auteurId: "sam", audio: AUDIO });
    await m.service.valider({ auteurId: "sam", propositionId: p.id, retenus: { taches: [0, 1] } });
    expect(m.notifs).toEqual([{ destinataireId: "alex", sujet: "Sam vous a confié 2 tâches." }]);
  });

  it("un rendez-vous sans enfant est gardé comme note ; un rendez-vous pour plusieurs enfants fait un créneau chacun", async () => {
    const m = monter({
      sortie: {
        transcription: "t",
        taches: [],
        rendezVous: [{ titre: "Réunion", debut: "2026-11-19T23:30" }, { titre: "Vaccins", debut: "2026-11-20T09:00", fin: "2026-11-20T10:00", enfantIds: ["leo", "nina", "leo"] }],
        notes: [],
      },
    });
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    const r = await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { rendezVous: [0, 1] } });
    expect(r).toMatchObject({ creneaux: 2, rendezVousEnNote: 1 });
    expect((await m.depotFamille.listerCreneaux()).map((c) => c.enfantId).sort()).toEqual(["leo", "nina"]);
    expect((await m.notes.lister()).map((n) => n.texte)).toEqual(["Rendez-vous : Réunion, le 2026-11-19 à 23:30."]);
  });

  it("récurrence annuelle : tous les 12 mois ; récurrence sans échéance ignorée", async () => {
    const m = monter({ sortie: { transcription: "t", taches: [{ titre: "Assurance", echeance: "2026-12-01", recurrence: "annuelle" }, { titre: "Sans ancre", recurrence: "hebdomadaire" }], rendezVous: [], notes: [] } });
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [0, 1] } });
    const [a, b] = await m.depotTaches.lister();
    expect(a?.recurrence).toEqual({ frequence: "mensuelle", intervalle: 12 });
    expect(b?.recurrence).toBeUndefined();
  });

  it("déclenche les synchros après écriture, seulement pour ce qui a changé", async () => {
    const m = monter();
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { rendezVous: [0] } });
    expect(m.synchros).toEqual(["agenda:alex"]);
    const q = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    await m.service.valider({ auteurId: "alex", propositionId: q.id, retenus: { taches: [1] } });
    expect(m.synchros).toEqual(["agenda:alex", "taches:alex"]);
  });

  it("échec de synchro ou de notification : les écritures restent, un avertissement est rendu", async () => {
    const m = monter({
      extra: {
        synchroApresModification: async () => {
          throw new Error("agenda indisponible");
        },
        notifications: {
          notifier: async () => {
            throw new Error("push en panne");
          },
        },
      },
    });
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    const r = await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [0], rendezVous: [0] } });
    expect(r.notifie).toBe(false);
    expect(r.avertissements).toHaveLength(2);
    expect(await m.depotTaches.lister()).toHaveLength(1);
    expect(await m.depotFamille.listerCreneaux()).toHaveLength(1);
  });

  it("plafond de notifications : un message regroupé compte comme notifié, sans contourner le service", async () => {
    const m = monter({ extra: { notifications: { notifier: async () => ({ statut: "regroupee", texte: "t" }) } } });
    const p = await m.service.proposer({ auteurId: "alex", audio: AUDIO });
    expect((await m.service.valider({ auteurId: "alex", propositionId: p.id, retenus: { taches: [0] } })).notifie).toBe(true);
  });
});
