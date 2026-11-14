import { describe, expect, it } from "vitest";
import { ErreurDomaine } from "../domaine/depot";
import { DepotMemoire } from "../domaine/depot-memoire";
import { familleFictive } from "../domaine/fixture-famille";
import type { Creneau, Transfert } from "../domaine/types";
import { BanqueMemoire } from "../firestore/banque-memoire";
import { DepotCarnetFirestore, DepotCochesFirestore } from "../firestore/carnet-firestore";
import { DepotCarnetMemoire, ecrireCarnetDuTransfert, lireCarnetDuTransfert } from "./carnet";
import { DepotCochesMemoire } from "./coches";
import { CONFIGURATION_LISTE_EXEMPLE } from "./configuration-liste-exemple";
import { suiteDepotCarnet, suiteDepotCoches } from "./contrats";
import { avancement, listeDuTransfert, validerConfigurationListe, type ConfigurationListe } from "./liste";

const adultes = ["alex", "sam"];
const maintenant = () => new Date("2031-05-04T08:00:00Z");

describe("DepotCarnetMemoire", () => {
  suiteDepotCarnet(async () => new DepotCarnetMemoire(adultes, { maintenant }));
});
describe("DepotCarnetFirestore sur banque en mémoire", () => {
  suiteDepotCarnet(async () => new DepotCarnetFirestore(new BanqueMemoire(), "fam-carnet", adultes, { maintenant }));
});
describe("DepotCochesMemoire", () => {
  suiteDepotCoches(async () => new DepotCochesMemoire(adultes, maintenant));
});
describe("DepotCochesFirestore sur banque en mémoire", () => {
  suiteDepotCoches(async () => new DepotCochesFirestore(new BanqueMemoire(), "fam-coches", adultes, maintenant));
});

describe("carnet : réglages en configuration", () => {
  it("applique une limite de lignes et de longueur différente", async () => {
    const d = new DepotCarnetMemoire(adultes, { configuration: { maxLignes: 1, longueurMaxLigne: 5 } });
    await d.ecrire("alex", { transfertId: "t" }, ["12345"]);
    await expect(d.ecrire("alex", { transfertId: "t" }, ["1", "2"])).rejects.toThrow(ErreurDomaine);
    await expect(d.ecrire("alex", { transfertId: "t" }, ["123456"])).rejects.toThrow(ErreurDomaine);
  });
  it("refuse une configuration absurde et un identifiant de famille impropre", () => {
    expect(() => new DepotCarnetMemoire(adultes, { configuration: { maxLignes: 0, longueurMaxLigne: 10 } })).toThrow(ErreurDomaine);
    expect(() => new DepotCarnetFirestore(new BanqueMemoire(), "a/b", adultes)).toThrow(ErreurDomaine);
    expect(() => new DepotCochesFirestore(new BanqueMemoire(), "..", adultes)).toThrow(ErreurDomaine);
  });
});

describe("carnet d'un transfert : seul celui qui remet écrit", () => {
  async function monter() {
    const famille = new DepotMemoire(familleFictive);
    const t = await famille.enregistrerTransfert("alex", {
      date: "2031-05-04",
      heure: "18:00",
      lieuId: "ecole",
      deposeId: "alex",
      recupereId: "sam",
      enfantIds: ["leo"],
    });
    return { famille, t, carnet: new DepotCarnetMemoire(adultes, { maintenant }) };
  }
  it("accepte celui qui remet, refuse celui qui récupère, et laisse celui-ci lire", async () => {
    const { famille, t, carnet } = await monter();
    await expect(ecrireCarnetDuTransfert(famille, carnet, "sam", t.id, ["x"])).rejects.toThrow(ErreurDomaine);
    await ecrireCarnetDuTransfert(famille, carnet, "alex", t.id, ["Léo a faim à 17 h"]);
    expect((await lireCarnetDuTransfert(famille, carnet, "sam", t.id))?.lignes).toEqual(["Léo a faim à 17 h"]);
  });
  it("refuse un transfert inconnu", async () => {
    const { famille, carnet } = await monter();
    await expect(ecrireCarnetDuTransfert(famille, carnet, "alex", "nul", ["x"])).rejects.toThrow(ErreurDomaine);
    await expect(lireCarnetDuTransfert(famille, carnet, "sam", "nul")).rejects.toThrow(ErreurDomaine);
  });
});

const transfert = (extra: Partial<Transfert> = {}): Transfert => ({
  id: "t-1",
  date: "2031-05-04",
  heure: "18:00",
  lieuId: "ecole",
  deposeId: "alex",
  recupereId: "sam",
  enfantIds: ["leo", "nina"],
  ...extra,
});
const creneau = (id: string, enfantId: string, date: string, libelle: string): Creneau => ({
  id,
  enfantId,
  date,
  debut: "10:00",
  fin: "11:00",
  libelle,
});
const ids = (l: { id: string }[]) => l.map((e) => e.id);

describe("listeDuTransfert", () => {
  const liste = (cr: Creneau[], t = transfert(), c: ConfigurationListe = CONFIGURATION_LISTE_EXEMPLE) =>
    listeDuTransfert(familleFictive, t, cr, c);

  it("donne la base, par enfant du transfert seulement", () => {
    expect(ids(liste([]))).toEqual([
      "leo|cartable",
      "leo|carnet-liaison",
      "nina|cartable",
      "nina|doudou",
      "nina|trousse-toilette",
    ]);
  });

  it("un créneau de sport du jour ou du lendemain ajoute la tenue, sans accent ni casse", () => {
    const l = liste([creneau("c1", "leo", "2031-05-05", "Séance de SPORT"), creneau("c2", "nina", "2031-05-04", "Sport")]);
    expect(l.filter((e) => e.code === "tenue-sport").map((e) => [e.enfantId, e.origine, e.creneauId])).toEqual([
      ["leo", "creneau", "c1"],
      ["nina", "creneau", "c2"],
    ]);
  });

  it("ignore les créneaux d'un autre enfant, de la veille ou du surlendemain", () => {
    const l = liste([
      creneau("c1", "mila", "2031-05-04", "Sport"),
      creneau("c2", "leo", "2031-05-03", "Sport"),
      creneau("c3", "leo", "2031-05-06", "Sport"),
    ]);
    expect(l.some((e) => e.origine === "creneau")).toBe(false);
  });

  it("respecte la fenêtre « lendemain » de la table, et plusieurs éléments par motif", () => {
    const l = liste([creneau("c1", "leo", "2031-05-04", "Musique"), creneau("c2", "nina", "2031-05-05", "Natation et musique")]);
    expect(ids(l).filter((i) => i.startsWith("leo|"))).not.toContain("leo|instrument");
    expect(ids(l).filter((i) => i.startsWith("nina|"))).toEqual([
      "nina|cartable",
      "nina|doudou",
      "nina|trousse-toilette",
      "nina|maillot-bain",
      "nina|serviette",
      "nina|instrument",
    ]);
  });

  it("n'ajoute pas deux fois le même code (base prioritaire, deux créneaux)", () => {
    const config: ConfigurationListe = {
      baseCommune: [{ code: "tenue-sport", libelle: "Tenue" }],
      baseParEnfant: {},
      correspondances: [{ motif: "sport", moment: "jour", elements: [{ code: "tenue-sport", libelle: "Autre" }] }],
    };
    const l = liste([creneau("c1", "leo", "2031-05-04", "Sport"), creneau("c2", "leo", "2031-05-04", "Sport")], transfert(), config);
    expect(l.filter((e) => e.enfantId === "leo")).toEqual([
      { id: "leo|tenue-sport", enfantId: "leo", enfant: "Léo", code: "tenue-sport", libelle: "Tenue", origine: "base" },
    ]);
  });

  it("s'adapte à une configuration différente, sans rien de codé en dur", () => {
    const config: ConfigurationListe = {
      baseCommune: [],
      baseParEnfant: { mila: [{ code: "peluche", libelle: "Peluche lunaire" }] },
      correspondances: [{ motif: "piscine", moment: "les-deux", elements: [{ code: "bonnet", libelle: "Bonnet" }] }],
    };
    const t = transfert({ enfantIds: ["mila", "mila", "inconnu"] });
    expect(ids(liste([creneau("c", "mila", "2031-05-05", "Piscine")], t, config))).toEqual(["mila|peluche", "mila|bonnet"]);
  });

  it("est stable quel que soit l'ordre des créneaux et ne les modifie pas", () => {
    const cr = [creneau("c2", "leo", "2031-05-04", "Sport"), creneau("c1", "leo", "2031-05-04", "Musique")];
    const copie = structuredClone(cr);
    expect(liste(cr)).toEqual(liste([...cr].reverse()));
    expect(cr).toEqual(copie);
  });

  it("refuse une configuration invalide", () => {
    const base = CONFIGURATION_LISTE_EXEMPLE;
    expect(() => validerConfigurationListe({ ...base, baseCommune: [{ code: "Mauvais Code", libelle: "x" }] })).toThrow(ErreurDomaine);
    expect(() => validerConfigurationListe({ ...base, baseCommune: [{ code: "ok", libelle: " " }] })).toThrow(ErreurDomaine);
    expect(() => validerConfigurationListe({ ...base, correspondances: [{ motif: " ", moment: "jour", elements: [] }] })).toThrow(ErreurDomaine);
    expect(() => validerConfigurationListe({ ...base, correspondances: [{ motif: "x", moment: "jamais" as "jour", elements: [] }] })).toThrow(ErreurDomaine);
  });
});

describe("avancement partagé", () => {
  it("compte les éléments cochés par l'un ou l'autre adulte et ignore les coches orphelines", async () => {
    const l = listeDuTransfert(familleFictive, transfert(), [], CONFIGURATION_LISTE_EXEMPLE);
    const coches = new DepotCochesMemoire(adultes, maintenant);
    await coches.definir("alex", "t-1", "leo|cartable", true);
    await coches.definir("sam", "t-1", "nina|doudou", true);
    await coches.definir("sam", "t-1", "mila|disparu", true);
    const a = avancement(l, await coches.lire("alex", "t-1"));
    expect([a.faits, a.total]).toEqual([2, 5]);
    expect(ids(a.restants)).not.toContain("leo|cartable");
  });
});
