import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lire = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const css = lire("./planning.css");
const global = lire("../globals.css");

const px = (v: string): number => (v.endsWith("rem") ? parseFloat(v) * 16 : parseFloat(v));
const echapper = (s: string) => s.replace(/[.>*:()\-]/g, "\\$&");
const regle = (source: string, selecteur: string, propriete: string): string => {
  const bloc = new RegExp(`(?:^|\\n)${echapper(selecteur)}\\s*\\{([^}]*)\\}`).exec(source);
  const val = bloc && new RegExp(`${echapper(propriete)}:\\s*([^;]+);`).exec(bloc[1]!);
  if (!val) throw new Error(`${selecteur} ${propriete} introuvable`);
  return val[1]!.trim();
};

describe("calendrier : cibles de 44 px sur téléphone", () => {
  it("tient 7 colonnes de 44 px dans 360 px d'écran", () => {
    const cible = px(regle(global, ":root", "--cible-min"));
    const marge = px(regle(global, ".contenu", "padding").split(/\s+/)[1]!);
    const carte = px(regle(css, ".carte--calendrier", "padding-inline"));
    expect(cible).toBe(44);
    expect(px(regle(css, ".calendrier td", "padding"))).toBe(0);
    const disponible = 360 - 2 * marge - 2 * carte;
    // 7 colonnes de largeur égale (table-layout: fixed) : chacune doit atteindre 44 px.
    expect(disponible / 7).toBeGreaterThanOrEqual(cible);
    expect(px(regle(css, ".jour", "min-height"))).toBeGreaterThanOrEqual(cible);
  });
});
