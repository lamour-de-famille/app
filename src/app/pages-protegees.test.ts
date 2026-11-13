import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lire = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

/** Non-régression : la production répondait 404 à cause d'un `notFound()` conditionnel à NODE_ENV. */
describe("pages Aujourd'hui et Planning en production", () => {
  for (const f of ["./aujourdhui/page.tsx", "./planning/page.tsx", "./planning/actions.ts"]) {
    it(`${f} : ni notFound ni masquage par NODE_ENV, garde de session présente`, () => {
      const s = lire(f);
      expect(s).not.toMatch(/notFound/);
      expect(s).not.toMatch(/NODE_ENV/);
      expect(s).toMatch(/exigerAdulte/);
    });
  }
  it("aucune page n'utilise le dépôt de démonstration directement", () => {
    for (const f of ["./aujourdhui/page.tsx", "./planning/page.tsx", "./planning/actions.ts"]) {
      expect(lire(f)).not.toMatch(/depotDemonstration|depotPartage/);
      expect(lire(f)).toMatch(/obtenirDepot/);
    }
  });
});
