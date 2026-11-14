import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("code réservé au serveur", () => {
  it("aucun composant client n'importe l'IA, la dictée ou les gardes serveur", () => {
    const interdit = /from\s+["'](@\/lib\/(ia|dictee|acces\/serveur)|(\.\.?\/)+(lib\/)?(ia|dictee))[/"']/;
    const clients = fichiers("src").filter((f) => /^\s*["']use client["']/m.test(readFileSync(f, "utf8").slice(0, 300)));
    for (const f of clients) expect(readFileSync(f, "utf8"), f).not.toMatch(interdit);
  });

  it("le client HTTP et le service portent l'avertissement serveur uniquement", () => {
    for (const f of ["src/lib/ia/client-gemini-http.ts", "src/lib/dictee/service.ts", "src/lib/dictee/routes.ts"]) {
      expect(readFileSync(f, "utf8").slice(0, 400), f).toMatch(/RÉSERVÉ AU SERVEUR/);
    }
  });
});
