import { beforeEach, describe, expect, it, vi } from "vitest";
import { StockageEtatMemoire } from "../agenda/types";
import { familleFictive as famille } from "../domaine/fixture-famille";
import { DepotTachesMemoire } from "../taches";
import {
  ClientTasksGoogle,
  TasksFactice,
  TITRE_LISTE_DEFAUT,
  encoderNotes,
  estMarquee,
  lireMarque,
  synchroniserTasksFamille,
  tachesSouhaitees,
} from "./index";

// Mercredi 11 novembre 2026.
const nouveauDepot = () => new DepotTachesMemoire(famille, { maintenant: () => new Date("2026-11-11T08:00:00Z") });
const SERIE = { frequence: "quotidienne", intervalle: 1 } as const;
const cles = (l: { cle: string }[]) => l.map((x) => x.cle);

describe("marque dans les notes", () => {
  const t = { cle: "tache-1@2026-11-12", titre: "Poubelles", notes: "Pour : Léo", echeance: "2026-11-12" } as const;
  it("encode et relit la clé et l'empreinte, en dernière ligne", () => {
    const notes = encoderNotes(t);
    expect(notes.startsWith("Pour : Léo\n\n[lamour-de-famille v1 cle=tache-1@2026-11-12 emp=")).toBe(true);
    expect(lireMarque(notes)).toMatchObject({ cle: "tache-1@2026-11-12" });
    expect(lireMarque(encoderNotes({ cle: "k@sans-date", titre: "x" }))).toMatchObject({ cle: "k@sans-date" });
  });
  it("ne reconnaît pas une marque absente, tronquée, ou qui n'est pas la dernière ligne", () => {
    const m = encoderNotes(t).split("\n").pop()!;
    for (const notes of ["", "Pour : Léo", m.slice(0, -2), `${m}\nautre texte`, `x ${m}`]) {
      expect(estMarquee({ id: "1", titre: "", notes, terminee: false })).toBe(false);
    }
  });
});

describe("tachesSouhaitees : confidentialité dans les deux sens", () => {
  for (const [proprio, intrus] of [["alex", "sam"], ["sam", "alex"]] as const) {
    it(`la liste de ${intrus} ne contient rien de ${proprio} (retard, à venir, sans date, série)`, async () => {
      const d = nouveauDepot();
      const retard = await d.enregistrer(proprio, { titre: "Retard", assigneId: proprio, echeance: "2026-11-03" });
      const venir = await d.enregistrer(proprio, { titre: "Venir", assigneId: proprio, echeance: "2026-11-12" });
      const sans = await d.enregistrer(proprio, { titre: "Sans", assigneId: proprio });
      const serie = await d.enregistrer(proprio, { titre: "Série", assigneId: proprio, echeance: "2026-11-02", recurrence: SERIE });
      const miens = await tachesSouhaitees(d, famille, proprio);
      const ids = [retard, venir, sans, serie].map((x) => x.id);
      expect(miens.map((m) => m.cle.split("@")[0]).filter((i, n, a) => a.indexOf(i) === n).sort()).toEqual(ids.sort());
      expect(miens.some((m) => m.cle === `${retard.id}@2026-11-03`)).toBe(true); // son propre retard : oui
      expect(await tachesSouhaitees(d, famille, intrus)).toEqual([]);
    });
  }

  it("une réassignation déplace la tâche : elle quitte la liste de l'un et entre dans celle de l'autre", async () => {
    const d = nouveauDepot();
    const t = await d.enregistrer("alex", { titre: "T", assigneId: "alex", echeance: "2026-11-14" });
    await d.enregistrer("alex", { id: t.id, titre: "T", assigneId: "sam", echeance: "2026-11-14" });
    expect(await tachesSouhaitees(d, famille, "alex")).toEqual([]);
    expect(cles(await tachesSouhaitees(d, famille, "sam"))).toEqual([`${t.id}@2026-11-14`]);
  });

  it("fenêtre : retard de série borné, avenir borné, tâches faites exclues, échéance en date seule", async () => {
    const d = nouveauDepot();
    const s = await d.enregistrer("alex", { titre: "S", assigneId: "alex", echeance: "2026-11-09", recurrence: SERIE, enfantId: "leo" });
    const f = await d.enregistrer("alex", { titre: "Faite", assigneId: "alex", echeance: "2026-11-10" });
    await d.cocher("alex", f.id);
    await d.cocher("alex", s.id, "2026-11-10");
    const v = await tachesSouhaitees(d, famille, "alex", { joursAvenir: 2, joursRattrapage: 5 });
    expect(cles(v)).toEqual(["09", "11", "12", "13"].map((j) => `${s.id}@2026-11-${j}`));
    expect(v[0]).toEqual({ cle: `${s.id}@2026-11-09`, titre: "S", notes: "Pour : Léo", echeance: "2026-11-09" });
  });

  it("refuse un adulte inconnu et des options invalides", async () => {
    const d = nouveauDepot();
    await expect(tachesSouhaitees(d, famille, "intrus")).rejects.toThrow(/Adulte inconnu/);
    await expect(tachesSouhaitees(d, famille, "alex", { joursAvenir: -1 })).rejects.toThrow(/joursAvenir/);
  });
});

describe("synchro Tasks avec doublure", () => {
  let depot: DepotTachesMemoire;
  let alex: TasksFactice;
  let sam: TasksFactice;
  let stockage: StockageEtatMemoire;
  const lancer = (extra: { clients?: Record<string, TasksFactice> } = {}) =>
    synchroniserTasksFamille({ depot, famille, clients: extra.clients ?? { alex, sam } }, stockage, () => new Date("2026-11-11T10:00:00Z"));
  const liste = async (c: TasksFactice) => c.contenu(await c.idListe(TITRE_LISTE_DEFAUT));
  const marquees = async (c: TasksFactice) => (await liste(c)).filter(estMarquee);

  beforeEach(async () => {
    depot = nouveauDepot();
    alex = new TasksFactice();
    sam = new TasksFactice();
    stockage = new StockageEtatMemoire();
    await depot.enregistrer("alex", { titre: "Poubelles", assigneId: "alex", echeance: "2026-11-12" });
    await depot.enregistrer("alex", { titre: "Rendez-vous Sam", assigneId: "sam", echeance: "2026-11-13", enfantId: "mila" });
    await depot.enregistrer("sam", { titre: "Retard de Sam", assigneId: "sam", echeance: "2026-11-01" });
  });

  it("chaque adulte ne reçoit que ses tâches (jamais celles ni le retard de l'autre)", async () => {
    await lancer();
    expect((await marquees(alex)).map((t) => t.titre)).toEqual(["Poubelles"]);
    expect((await marquees(sam)).map((t) => t.titre).sort()).toEqual(["Rendez-vous Sam", "Retard de Sam"]);
    const brut = JSON.stringify(await liste(alex));
    expect(brut).not.toMatch(/Retard de Sam|Rendez-vous Sam|2026-11-01|2026-11-13/);
    expect((await liste(sam))[0]).toMatchObject({ titre: expect.any(String), terminee: false });
    expect((await liste(sam)).find((t) => t.titre === "Rendez-vous Sam")).toMatchObject({ echeance: "2026-11-13" });
    expect(await stockage.lire("alex")).toMatchObject({ statut: "ok", nombreElements: 1, crees: 1 });
  });

  it("relancer ne crée aucun doublon et n'écrit rien", async () => {
    await lancer();
    const avant = await liste(sam);
    alex.appels.length = 0;
    sam.appels.length = 0;
    const etats = await lancer();
    expect(await liste(sam)).toEqual(avant);
    expect([...alex.appels, ...sam.appels].filter((a) => a.action !== "lister" && a.action !== "idListe")).toEqual([]);
    expect(etats.sam).toMatchObject({ crees: 0, modifies: 0, supprimes: 0 });
  });

  it("modifie ce qui change, supprime ce qui n'est plus voulu (faite, supprimée, réassignée)", async () => {
    await lancer();
    const [p] = await depot.lister();
    await depot.enregistrer("alex", { id: p!.id, titre: "Poubelles vertes", assigneId: "alex", echeance: "2026-11-12" });
    const e1 = await lancer();
    expect(e1.alex).toMatchObject({ modifies: 1, crees: 0 });
    expect((await marquees(alex))[0]).toMatchObject({ titre: "Poubelles vertes", echeance: "2026-11-12" });
    await depot.cocher("alex", p!.id);
    const e2 = await lancer();
    expect(e2.alex).toMatchObject({ supprimes: 1 });
    expect(await marquees(alex)).toEqual([]);
    expect(await marquees(sam)).toHaveLength(2);
  });

  it("ne touche jamais une tâche sans marque (ni une marque falsifiée) dans la liste dédiée", async () => {
    const id = await alex.idListe(TITRE_LISTE_DEFAUT);
    const a = alex.ajouterEtrangere(id, { titre: "Courses perso", notes: "à moi" });
    const b = alex.ajouterEtrangere(id, { titre: "Faux", notes: "[lamour-de-famille v1 cle=x emp=zz]" });
    const c = alex.ajouterEtrangere(id, { titre: "Marque au milieu", notes: "[lamour-de-famille v1 cle=x emp=0123456789abcdef]\nsuite" });
    await lancer();
    await depot.supprimer("alex", (await depot.lister())[0]!.id);
    await lancer();
    const apres = await liste(alex);
    for (const e of [a, b, c]) expect(apres).toContainEqual(e);
    expect(alex.appels.filter((x) => x.action === "supprimer" && [a.id, b.id, c.id].includes(x.id!))).toEqual([]);
  });

  it("une tâche cochée dans Google Tasks est ignorée : ni décochée, ni recréée, ni répercutée", async () => {
    await lancer();
    const t = (await marquees(alex))[0]!;
    alex.terminer(await alex.idListe(TITRE_LISTE_DEFAUT), t.id);
    const avant = await depot.lister();
    alex.appels.length = 0;
    await lancer();
    expect(await marquees(alex)).toEqual([{ ...t, terminee: true }]);
    expect(alex.appels.filter((a) => a.action === "creer" || a.action === "mettreAJour")).toEqual([]);
    expect(await depot.lister()).toEqual(avant);
    // Une modification côté application met à jour sans décocher.
    await depot.enregistrer("alex", { id: avant[0]!.id, titre: "Renommée", assigneId: "alex", echeance: "2026-11-12" });
    await lancer();
    expect(await marquees(alex)).toMatchObject([{ titre: "Renommée", terminee: true }]);
  });

  it("coupure en cours de synchro : état a_reconnecter, rien de supprimé, reprise sans doublon", async () => {
    const idSam = await sam.idListe(TITRE_LISTE_DEFAUT);
    sam.expirerApresCreations = 1;
    const e1 = await lancer();
    expect(e1.sam).toMatchObject({ statut: "a_reconnecter", crees: 1 });
    expect(e1.alex).toMatchObject({ statut: "ok" });
    expect(sam.contenu(idSam).filter(estMarquee)).toHaveLength(1);
    sam.retablirAutorisation();
    const e2 = await lancer();
    expect(e2.sam).toMatchObject({ statut: "ok", crees: 1 });
    const titres = (await marquees(sam)).map((t) => t.titre).sort();
    expect(titres).toEqual(["Rendez-vous Sam", "Retard de Sam"]);
  });

  it("autorisation expirée dès le départ : a_reconnecter, dernier succès conservé, rien supprimé", async () => {
    await lancer();
    const idSam = await sam.idListe(TITRE_LISTE_DEFAUT);
    sam.expirerAutorisation();
    const etats = await synchroniserTasksFamille({ depot, famille, clients: { alex, sam } }, stockage, () => new Date("2026-11-12T10:00:00Z"));
    expect(etats.sam).toMatchObject({ statut: "a_reconnecter", dernierSucces: "2026-11-11T10:00:00.000Z", nombreElements: 2 });
    expect(etats.alex).toMatchObject({ statut: "ok" });
    expect(sam.contenu(idSam).filter(estMarquee)).toHaveLength(2);
  });

  it("adulte sans client : a_reconnecter, sans effet sur l'autre", async () => {
    const etats = await lancer({ clients: { alex } });
    expect(etats.sam).toMatchObject({ statut: "a_reconnecter" });
    expect(etats.alex).toMatchObject({ statut: "ok" });
  });

  it("le client d'un adulte n'est jamais utilisé pour l'autre", async () => {
    await lancer();
    const titresAlex = (await marquees(alex)).map((t) => t.titre);
    expect(titresAlex.every((t) => t === "Poubelles")).toBe(true);
  });
});

describe("ClientTasksGoogle (faux fetch, aucun appel réel)", () => {
  const reponse = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status });

  it("mappe les tâches, pagine, et envoie la date seule", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reponse({ items: [{ id: "a", title: "A", notes: "n", due: "2026-11-12T00:00:00.000Z", status: "completed" }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(reponse({ items: [{ id: "b", title: "B" }] }))
      .mockResolvedValueOnce(reponse({ id: "c", title: "C" }));
    const c = new ClientTasksGoogle(async () => "jeton-factice", f);
    expect(await c.lister("L")).toEqual([
      { id: "a", titre: "A", notes: "n", echeance: "2026-11-12", terminee: true },
      { id: "b", titre: "B", notes: "", terminee: false },
    ]);
    expect(String(f.mock.calls[0]![0])).toContain("showCompleted=true");
    await c.creer("L", { titre: "C", notes: "m", echeance: "2026-11-20" });
    expect(JSON.parse(String(f.mock.calls[2]![1]!.body))).toEqual({ title: "C", notes: "m", due: "2026-11-20T00:00:00.000Z" });
  });

  it("mettreAJour : PATCH sans statut ; 401 devient une autorisation expirée ; suppression déjà faite tolérée", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reponse({ id: "a", title: "A" }))
      .mockResolvedValueOnce(reponse({}, 404))
      .mockResolvedValueOnce(reponse({}, 401));
    const c = new ClientTasksGoogle(async () => "jeton-factice", f);
    await c.mettreAJour("L", "a", { titre: "A", notes: "m" });
    expect(f.mock.calls[0]![1]!.method).toBe("PATCH");
    expect(JSON.parse(String(f.mock.calls[0]![1]!.body))).toEqual({ title: "A", notes: "m", due: null });
    await expect(c.supprimer("L", "a")).resolves.toBeUndefined();
    await expect(c.lister("L")).rejects.toThrow(/expirée/);
  });

  it("idListe : retrouve la liste par son titre, sinon la crée", async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reponse({ items: [{ id: "x", title: "Autre" }, { id: "L1", title: TITRE_LISTE_DEFAUT }] }))
      .mockResolvedValueOnce(reponse({ items: [] }))
      .mockResolvedValueOnce(reponse({ id: "L2" }));
    const c = new ClientTasksGoogle(async () => "jeton-factice", f);
    expect(await c.idListe(TITRE_LISTE_DEFAUT)).toBe("L1");
    expect(await c.idListe(TITRE_LISTE_DEFAUT)).toBe("L2");
    expect(f.mock.calls[2]![1]!.method).toBe("POST");
  });
});
