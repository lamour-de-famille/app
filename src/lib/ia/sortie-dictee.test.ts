import { describe, expect, it } from "vitest";
import { familleFictive } from "../domaine/fixture-famille";
import { ClientGeminiFactice } from "./client-gemini-factice";
import { analyserSortieDictee, SortieDicteeInvalide, sortieDicteeSure, validerSortieDictee, verifierIdentifiants } from "./sortie-dictee";

const valide = {
  transcription: "Alex doit appeler l'école pour Léo vendredi, dentiste de Mila le 20 à 14h.",
  taches: [{ titre: "Appeler l'école", assigneId: "alex", echeance: "2026-11-20", enfantId: "leo", recurrence: "hebdomadaire" }],
  rendezVous: [{ titre: "Dentiste", debut: "2026-11-20T14:00", fin: "2026-11-20T15:00", lieu: "Cabinet", enfantIds: ["mila"] }],
  notes: [{ texte: "Nina a besoin de nouvelles chaussures", enfantId: "nina" }],
};

const problemes = (v: unknown) => {
  try {
    validerSortieDictee(v);
  } catch (e) {
    return (e as SortieDicteeInvalide).problemes.join(" | ");
  }
  return "";
};

describe("validation stricte", () => {
  it("accepte une sortie complète et une sortie minimale", () => {
    expect(validerSortieDictee(valide)).toEqual(valide);
    const min = { transcription: "", taches: [], rendezVous: [], notes: [] };
    expect(validerSortieDictee(min)).toEqual(min);
  });

  it("rejette les champs inconnus, à tous les niveaux", () => {
    expect(problemes({ ...valide, extra: 1 })).toContain("sortie.extra champ inconnu");
    expect(problemes({ ...valide, taches: [{ titre: "x", priorite: 1 }] })).toContain("taches[0].priorite champ inconnu");
    expect(problemes({ ...valide, rendezVous: [{ titre: "x", debut: "2026-11-20T14:00", salle: "a" }] })).toContain("rendezVous[0].salle");
    expect(problemes({ ...valide, notes: [{ texte: "x", auteur: "y" }] })).toContain("notes[0].auteur");
  });

  it("rejette les types et formats erronés avec un message clair", () => {
    expect(problemes({ ...valide, transcription: 3 })).toContain("transcription doit être un texte");
    expect(problemes({ ...valide, taches: "non" })).toContain("taches doit être une liste");
    expect(problemes({ ...valide, notes: undefined })).toContain("notes doit être une liste");
    expect(problemes({ ...valide, taches: [{ titre: 5 }] })).toContain("taches[0].titre doit être un texte non vide");
    expect(problemes({ ...valide, taches: [{}] })).toContain("taches[0].titre est obligatoire");
    expect(problemes({ ...valide, taches: [{ titre: "x", echeance: "2026-02-30" }] })).toContain("taches[0].echeance");
    expect(problemes({ ...valide, taches: [{ titre: "x", echeance: "20/11/2026" }] })).toContain("taches[0].echeance");
    expect(problemes({ ...valide, taches: [{ titre: "x", recurrence: "parfois" }] })).toContain("taches[0].recurrence");
    expect(problemes({ ...valide, rendezVous: [{ titre: "x", debut: "2026-11-20" }] })).toContain("rendezVous[0].debut");
    expect(problemes({ ...valide, rendezVous: [{ titre: "x", debut: "2026-11-20T25:00" }] })).toContain("rendezVous[0].debut");
    expect(problemes({ ...valide, rendezVous: [{ titre: "x", debut: "2026-11-20T14:00", fin: "2026-11-20T13:00" }] })).toContain("précéder");
    expect(problemes({ ...valide, rendezVous: [{ titre: "x", debut: "2026-11-20T14:00", enfantIds: [1] }] })).toContain("enfantIds");
    expect(problemes("texte")).toContain("sortie doit être un objet");
    expect(problemes([])).toContain("sortie doit être un objet");
    expect(problemes(null)).toContain("sortie doit être un objet");
  });
});

describe("analyse de la réponse brute", () => {
  it("tolère les clôtures markdown", () => {
    const json = JSON.stringify(valide);
    expect(analyserSortieDictee(json)).toEqual(valide);
    expect(analyserSortieDictee("```json\n" + json + "\n```")).toEqual(valide);
    expect(analyserSortieDictee("  ```\n" + json + "\n```  ")).toEqual(valide);
  });

  it("rejette un JSON cassé", () => {
    expect(() => analyserSortieDictee("```json\n{oups\n```")).toThrow(SortieDicteeInvalide);
    expect(() => analyserSortieDictee("")).toThrow(/JSON/);
  });
});

describe("vérification croisée avec la famille", () => {
  it("accepte des identifiants existants", () => {
    expect(() => verifierIdentifiants(valide as never, familleFictive)).not.toThrow();
  });

  it("rejette tout identifiant inconnu ou de mauvaise nature", () => {
    const mauvais = {
      ...valide,
      taches: [{ titre: "x", assigneId: "leo", enfantId: "alex" }],
      rendezVous: [{ titre: "y", debut: "2026-11-20T14:00", enfantIds: ["leo", "inconnu"] }],
      notes: [{ texte: "z", enfantId: "inconnu" }],
    };
    let msg = "";
    try {
      verifierIdentifiants(mauvais as never, familleFictive);
    } catch (e) {
      msg = (e as Error).message;
    }
    for (const attendu of ["taches[0].assigneId", "taches[0].enfantId", "rendezVous[0].enfantIds « inconnu »", "notes[0].enfantId"]) expect(msg).toContain(attendu);
  });

  it("sortieDicteeSure ne renvoie rien d'utilisable si invalide", () => {
    expect(sortieDicteeSure(JSON.stringify(valide), familleFictive)).toEqual(valide);
    expect(() => sortieDicteeSure(JSON.stringify({ ...valide, notes: [{ texte: "x", enfantId: "inconnu" }] }), familleFictive)).toThrow(SortieDicteeInvalide);
  });
});

describe("doublure", () => {
  it("renvoie une sortie déterministe et trace les appels", async () => {
    const f = new ClientGeminiFactice({ sortie: valide as never });
    const r = await f.traiterDictee({ audio: { octets: new Uint8Array(), mimeType: "audio/webm" }, famille: familleFictive, maintenant: new Date(0), adulteId: "alex" });
    expect(r.resultat).toEqual(valide);
    expect(r.usage).toEqual({ jetonsEntree: 100, jetonsSortie: 50 });
    expect(f.appelsDictee).toHaveLength(1);
  });

  it("vérifie elle aussi les identifiants et porte l'usage de l'appel", async () => {
    const f = new ClientGeminiFactice({ sortie: { ...valide, notes: [{ texte: "x", enfantId: "inconnu" }] } as never, usage: { jetonsEntree: 7, jetonsSortie: 3 } });
    const e = await f.traiterDictee({ audio: { octets: new Uint8Array(), mimeType: "audio/webm" }, famille: familleFictive, maintenant: new Date(0), adulteId: "alex" }).catch((x) => x);
    expect(e).toBeInstanceOf(SortieDicteeInvalide);
    expect(e.usage).toEqual({ jetonsEntree: 7, jetonsSortie: 3 });
  });
});
