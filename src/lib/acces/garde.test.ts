import { describe, expect, it } from "vitest";
import { creerJeton } from "@/lib/auth/session";
import { familleFictive } from "@/lib/domaine/fixture-famille";
import type { Banque, TransactionBanque, OptionsTransaction } from "@/lib/firestore/banque";
import { BanqueMemoire } from "@/lib/firestore/banque-memoire";
import { DepotFirestore } from "@/lib/firestore/depot-firestore";
import { controlerAcces } from "./garde";

const CLE = "cle-de-test-fictive-0123456789-abcdefghij";
const ENV = {
  NODE_ENV: "production",
  SESSION_SECRET: CLE,
  FAMILLE_ID: "fam-1",
  FIRESTORE_PROJECT_ID: "p",
  ADULTES_EMAILS: "alex=alex@exemple.invalid",
  ALLOWED_EMAILS: "alex@exemple.invalid",
};

function compteuse(base: Banque) {
  const c = { acces: 0 };
  const banque: Banque = {
    transaction<T>(t: (tx: TransactionBanque) => Promise<T>, o?: OptionsTransaction) {
      c.acces++;
      return base.transaction(t, o);
    },
  };
  return { banque, c };
}

describe("controlerAcces : la session est vérifiée avant toute lecture de la base", () => {
  it("sans session et sans configuration : /connexion, base jamais lue", async () => {
    const { banque, c } = compteuse(new BanqueMemoire());
    const r = await controlerAcces({ env: { NODE_ENV: "production" }, date: "2026-11-14", banque });
    expect(r).toEqual({ ok: false, redirection: "/connexion" });
    expect(c.acces).toBe(0);
  });
  it("jeton invalide ou e-mail non autorisé : base jamais lue", async () => {
    const { banque, c } = compteuse(new BanqueMemoire());
    expect((await controlerAcces({ env: ENV, date: "d", jeton: "x.y", banque })).ok).toBe(false);
    const autre = creerJeton({ email: "z@exemple.invalid", nom: "Z" }, Date.now(), CLE);
    expect((await controlerAcces({ env: ENV, date: "d", jeton: autre, banque })).ok).toBe(false);
    expect(c.acces).toBe(0);
  });
  it("session valide : famille lue une seule fois, dépôt et famille rendus", async () => {
    const mem = new BanqueMemoire();
    await new DepotFirestore(mem, "fam-1").initialiserFamille(familleFictive);
    const { banque, c } = compteuse(mem);
    const jeton = creerJeton({ email: "alex@exemple.invalid", nom: "A" }, Date.now(), CLE);
    const r = await controlerAcces({ env: ENV, date: "2026-11-14", jeton, banque });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r).toMatchObject({ adulteId: "alex", demo: false });
      expect(r.famille.nom).toBe(familleFictive.nom);
    }
    expect(c.acces).toBe(1);
  });
  it("session valide mais non configuré : ErreurNonConfigure", async () => {
    const jeton = creerJeton({ email: "alex@exemple.invalid", nom: "A" }, Date.now(), CLE);
    const env = { ...ENV, FAMILLE_ID: "" };
    await expect(controlerAcces({ env, date: "d", jeton })).rejects.toThrow(/FAMILLE_ID/);
  });
  it("mode démo : dépôt de démonstration, aucune base", async () => {
    const r = await controlerAcces({ env: { NODE_ENV: "development", MODE_DEMO: "1" }, date: "2026-11-14", adulteParam: "sam" });
    expect(r).toMatchObject({ ok: true, adulteId: "sam", demo: true });
  });
});
