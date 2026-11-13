import { describe, expect, it } from "vitest";
import { familleFictive } from "@/lib/domaine/fixture-famille";
import { construireDemande } from "./echange";

const base = { famille: familleFictive, adulteId: "alex", du: "2026-11-20", au: "2026-11-22", enfantIds: ["leo"], garde: "moi" };

describe("construireDemande", () => {
  it("construit la demande « la garde chez moi » sur les jours demandés", () => {
    expect(construireDemande(base)).toEqual({
      ok: true,
      demande: { responsableId: "alex", enfantIds: ["leo"], jours: ["2026-11-20", "2026-11-21", "2026-11-22"] },
    });
  });

  it("désigne l'autre adulte quand on lui confie la garde", () => {
    const r = construireDemande({ ...base, garde: "autre", au: "2026-11-20" });
    expect(r).toMatchObject({ ok: true, demande: { responsableId: "sam", jours: ["2026-11-20"] } });
  });

  it("sans fin, ne demande que le premier jour", () => {
    expect(construireDemande({ ...base, au: "" })).toMatchObject({ ok: true, demande: { jours: ["2026-11-20"] } });
  });

  it("dédoublonne les enfants et donne un code de résultat", () => {
    expect(construireDemande({ ...base, enfantIds: ["leo", "leo"] })).toMatchObject({ ok: true, demande: { enfantIds: ["leo"] } });
    expect(construireDemande({ ...base, du: "2026-02-31" })).toMatchObject({ ok: false, code: "invalide-dates" });
    expect(construireDemande({ ...base, garde: "?" })).toMatchObject({ ok: false, code: "invalide-garde" });
  });

  it("explique chaque erreur en français", () => {
    expect(construireDemande({ ...base, du: "" })).toMatchObject({ ok: false, message: "Indiquez le premier jour." });
    expect(construireDemande({ ...base, enfantIds: [] })).toMatchObject({ ok: false, message: "Choisissez au moins un enfant." });
    expect(construireDemande({ ...base, enfantIds: ["inconnu"] })).toMatchObject({ ok: false, message: "Enfant inconnu." });
    expect(construireDemande({ ...base, garde: "?" })).toMatchObject({ ok: false, message: "Indiquez qui aura la garde." });
    expect(construireDemande({ ...base, au: "2026-11-19" })).toMatchObject({ ok: false });
    expect(construireDemande({ ...base, adulteId: "x" })).toMatchObject({ ok: false, message: "Adulte inconnu." });
  });
});
