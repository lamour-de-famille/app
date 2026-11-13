import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RepereEnfant } from "./RepereEnfant";
import type { Repere } from "@/lib/vues/planning";

const repere = (forme: Repere["forme"], marqueur: string): Repere => ({
  enfantId: "leo",
  prenom: "Léo",
  couleur: "#1E6BFF",
  etat: forme === "inconnu" ? null : "adulte-connecte",
  forme,
  marqueur,
  libelle: "Léo, chez vous",
});

describe("RepereEnfant", () => {
  it("est décoratif et distingue les états par la forme, pas par la couleur seule", () => {
    const rendus = [
      renderToStaticMarkup(<RepereEnfant repere={repere("plein", "✓")} />),
      renderToStaticMarkup(<RepereEnfant repere={repere("contour", "•")} />),
      renderToStaticMarkup(<RepereEnfant repere={repere("tiers", "–")} />),
      renderToStaticMarkup(<RepereEnfant repere={repere("inconnu", "?")} />),
    ];
    for (const h of rendus) expect(h).toContain('aria-hidden="true"');
    expect(rendus[0]).toContain("repere--plein");
    expect(rendus[0]).toContain("background:#1E6BFF");
    expect(rendus[1]).toContain("repere--contour");
    expect(rendus[1]).toContain("border-color:#1E6BFF");
    expect(rendus[2]).toContain("repere--tiers");
    expect(rendus[3]).toContain("repere--inconnu");
    expect(new Set(rendus).size).toBe(4);
  });
});
