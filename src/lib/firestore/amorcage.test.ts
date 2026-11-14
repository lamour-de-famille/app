import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { familleFictive } from "@/lib/domaine/fixture-famille";
import { BanqueMemoire } from "./banque-memoire";
import { DepotFirestore } from "./depot-firestore";
import { amorcerFamille } from "./amorcage";

const fichier = (contenu: string) => {
  const p = join(mkdtempSync(join(tmpdir(), "amorcage-")), "famille.json");
  writeFileSync(p, contenu);
  return p;
};

describe("amorçage de la famille depuis un fichier JSON", () => {
  it("crée la famille en base, relisible", async () => {
    const banque = new BanqueMemoire();
    await amorcerFamille(banque, { FAMILLE_ID: "fam-1", FAMILLE_JSON: fichier(JSON.stringify(familleFictive)) });
    expect((await new DepotFirestore(banque, "fam-1").lireFamille()).adultes.map((a) => a.id)).toEqual(["alex", "sam"]);
  });
  it("variables manquantes, fichier illisible ou invalide : erreur explicite", async () => {
    const banque = new BanqueMemoire();
    await expect(amorcerFamille(banque, { FAMILLE_JSON: "x" })).rejects.toThrow(/FAMILLE_ID/);
    await expect(amorcerFamille(banque, { FAMILLE_ID: "f" })).rejects.toThrow(/FAMILLE_JSON/);
    await expect(amorcerFamille(banque, { FAMILLE_ID: "f", FAMILLE_JSON: "/inexistant.json" })).rejects.toThrow(/lire/);
    await expect(amorcerFamille(banque, { FAMILLE_ID: "f", FAMILLE_JSON: fichier("{pas du json") })).rejects.toThrow(/JSON/);
    expect(banque.compter()).toBe(0);
  });
  it("refuse d'écraser une famille existante", async () => {
    const banque = new BanqueMemoire();
    const env = { FAMILLE_ID: "fam-1", FAMILLE_JSON: fichier(JSON.stringify(familleFictive)) };
    await amorcerFamille(banque, env);
    await expect(amorcerFamille(banque, env)).rejects.toThrow(/déjà initialisée/);
  });
});
