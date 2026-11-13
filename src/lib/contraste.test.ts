import { describe, expect, it } from "vitest";
import { contraste, texteSur, SEUIL_TEXTE } from "./contraste";
import { COULEURS_ENFANTS } from "@/components/PastilleEnfant";

const TEXTE = "#1D1B26";
const SECONDAIRE = "#4A4757";
const BLANC = "#FFFFFF";
const FOND = ["#FFF0F6", "#FFE4EE"];

describe("contraste", () => {
  it("vaut 21 pour noir sur blanc et 1 pour deux couleurs identiques", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contraste("#FF2E88", "#ff2e88")).toBeCloseTo(1, 5);
  });
  it("accepte la forme courte et refuse une couleur invalide", () => {
    expect(contraste("#fff", "#000")).toBeCloseTo(21, 5);
    expect(() => contraste("rose", "#000")).toThrow();
  });
  it("texte et texte secondaire sont lisibles sur blanc", () => {
    expect(contraste(TEXTE, BLANC)).toBeGreaterThanOrEqual(SEUIL_TEXTE);
    expect(contraste(SECONDAIRE, BLANC)).toBeGreaterThanOrEqual(SEUIL_TEXTE);
  });
  it("texte et texte secondaire sont lisibles sur le fond rose (deux extrémités)", () => {
    for (const f of FOND) {
      expect(contraste(TEXTE, f)).toBeGreaterThanOrEqual(SEUIL_TEXTE);
      expect(contraste(SECONDAIRE, f)).toBeGreaterThanOrEqual(SEUIL_TEXTE);
    }
  });
  it("le texte de chaque couleur d'enfant est lisible sur la pastille pleine", () => {
    for (const [prenom, couleur] of Object.entries(COULEURS_ENFANTS)) {
      expect(contraste(texteSur(couleur), couleur), prenom).toBeGreaterThanOrEqual(SEUIL_TEXTE);
    }
  });
  it("chaque contour d'enfant atteint 3:1 sur blanc (élément graphique, WCAG 1.4.11)", () => {
    for (const [prenom, couleur] of Object.entries(COULEURS_ENFANTS)) {
      expect(contraste(couleur, BLANC), prenom).toBeGreaterThanOrEqual(3);
    }
  });
  it("le texte est lisible sur la pastille grise et sur la pastille contour", () => {
    expect(contraste(TEXTE, "#E3E1E8")).toBeGreaterThanOrEqual(SEUIL_TEXTE);
    expect(contraste(TEXTE, BLANC)).toBeGreaterThanOrEqual(SEUIL_TEXTE);
  });
});
