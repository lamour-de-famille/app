import { describe, expect, it } from "vitest";
import { ErreurDomaine } from "../domaine/depot";
import type { DepotCarnet } from "./carnet";
import type { DepotCoches } from "./coches";

/** Contrats communs, exécutés contre chaque implémentation. Adultes fictifs : alex et sam ; intrus : zoe. */
const T1 = { transfertId: "t-1" };
const JOUR = { date: "2031-05-04" };

export function suiteDepotCarnet(creer: () => Promise<DepotCarnet>) {
  describe("contrat DepotCarnet", () => {
    it("n'a rien tant que rien n'est écrit", async () => {
      expect(await (await creer()).lire("sam", T1)).toBeUndefined();
    });

    it("l'auteur écrit, l'autre adulte lit les mêmes lignes nettoyées", async () => {
      const d = await creer();
      const ecrit = await d.ecrire("alex", T1, ["  Léo a un rhume  ", "Mila dort tôt"]);
      expect(ecrit.lignes).toEqual(["Léo a un rhume", "Mila dort tôt"]);
      const lu = await d.lire("sam", T1);
      expect(lu).toMatchObject({ auteurId: "alex", lignes: ["Léo a un rhume", "Mila dort tôt"], cible: T1 });
      expect(lu?.modifieLe).toMatch(/^\d{4}-\d\d-\d\dT/);
    });

    it("rattache aussi un carnet à une date, séparé de celui du transfert", async () => {
      const d = await creer();
      await d.ecrire("alex", JOUR, ["Pour la date"]);
      await d.ecrire("alex", T1, ["Pour le transfert"]);
      expect((await d.lire("sam", JOUR))?.lignes).toEqual(["Pour la date"]);
      expect((await d.lire("sam", T1))?.lignes).toEqual(["Pour le transfert"]);
    });

    it("l'auteur remplace ses lignes ; l'autre adulte ne peut ni modifier ni effacer", async () => {
      const d = await creer();
      await d.ecrire("alex", T1, ["Avant"]);
      await expect(d.ecrire("sam", T1, ["Intrusion"])).rejects.toThrow(ErreurDomaine);
      await expect(d.effacer("sam", T1)).rejects.toThrow(ErreurDomaine);
      await d.ecrire("alex", T1, ["Après"]);
      expect((await d.lire("sam", T1))?.lignes).toEqual(["Après"]);
      await d.effacer("alex", T1);
      expect(await d.lire("sam", T1)).toBeUndefined();
      await d.effacer("alex", T1);
    });

    it("refuse plus de trois lignes, une ligne vide, trop longue, ou sur plusieurs lignes", async () => {
      const d = await creer();
      await d.ecrire("alex", T1, ["a", "b", "c"]);
      for (const mauvais of [["a", "b", "c", "d"], [], ["ok", "   "], ["x".repeat(81)], ["deux\nlignes"]]) {
        await expect(d.ecrire("alex", T1, mauvais)).rejects.toThrow(ErreurDomaine);
      }
      expect((await d.lire("sam", T1))?.lignes).toEqual(["a", "b", "c"]);
    });

    it("refuse un inconnu en lecture comme en écriture, et les cibles invalides", async () => {
      const d = await creer();
      await expect(d.ecrire("zoe", T1, ["x"])).rejects.toThrow(ErreurDomaine);
      await expect(d.lire("zoe", T1)).rejects.toThrow(ErreurDomaine);
      await expect(d.ecrire("alex", { transfertId: "a/b" }, ["x"])).rejects.toThrow(ErreurDomaine);
      await expect(d.ecrire("alex", { date: "2031-02-30" }, ["x"])).rejects.toThrow(ErreurDomaine);
    });

    it("isole la valeur retournée", async () => {
      const d = await creer();
      const c = await d.ecrire("alex", T1, ["a"]);
      c.lignes.push("modifié");
      (await d.lire("sam", T1))!.lignes.push("autre");
      expect((await d.lire("sam", T1))?.lignes).toEqual(["a"]);
    });
  });
}

export function suiteDepotCoches(creer: () => Promise<DepotCoches>) {
  describe("contrat DepotCoches", () => {
    it("démarre vide", async () => {
      expect(await (await creer()).lire("sam", "t-1")).toEqual({});
    });

    it("l'autre adulte voit ce que le premier coche, avec l'auteur du cochage", async () => {
      const d = await creer();
      await d.definir("alex", "t-1", "leo|cartable", true);
      const vu = await d.lire("sam", "t-1");
      expect(Object.keys(vu)).toEqual(["leo|cartable"]);
      expect(vu["leo|cartable"]?.parId).toBe("alex");
    });

    it("cocher deux fois est idempotent et garde le premier cochage, même par l'autre adulte", async () => {
      const d = await creer();
      await d.definir("alex", "t-1", "leo|cartable", true);
      const avant = await d.lire("alex", "t-1");
      await d.definir("alex", "t-1", "leo|cartable", true);
      await d.definir("sam", "t-1", "leo|cartable", true);
      expect(await d.lire("sam", "t-1")).toEqual(avant);
    });

    it("décocher est idempotent et ne touche pas aux autres éléments ni aux autres transferts", async () => {
      const d = await creer();
      await d.definir("alex", "t-1", "a", true);
      await d.definir("alex", "t-1", "b", true);
      await d.definir("alex", "t-2", "a", true);
      await d.definir("sam", "t-1", "a", false);
      await d.definir("sam", "t-1", "a", false);
      await d.definir("sam", "t-1", "z", false);
      expect(Object.keys(await d.lire("alex", "t-1"))).toEqual(["b"]);
      expect(Object.keys(await d.lire("alex", "t-2"))).toEqual(["a"]);
    });

    it("des cochages simultanés ne se perdent pas", async () => {
      const d = await creer();
      await Promise.all(["a", "b", "c", "d"].map((e, i) => d.definir(i % 2 ? "sam" : "alex", "t-1", e, true)));
      expect(Object.keys(await d.lire("alex", "t-1")).sort()).toEqual(["a", "b", "c", "d"]);
    });

    it("refuse un inconnu et les identifiants impropres", async () => {
      const d = await creer();
      await expect(d.definir("zoe", "t-1", "a", true)).rejects.toThrow(ErreurDomaine);
      await expect(d.lire("zoe", "t-1")).rejects.toThrow(ErreurDomaine);
      await expect(d.definir("alex", "a/b", "a", true)).rejects.toThrow(ErreurDomaine);
      await expect(d.definir("alex", "t-1", "", true)).rejects.toThrow(ErreurDomaine);
      await expect(d.definir("alex", "t-1", "a/b", true)).rejects.toThrow(ErreurDomaine);
    });

    it("isole la valeur retournée", async () => {
      const d = await creer();
      await d.definir("alex", "t-1", "a", true);
      delete (await d.lire("sam", "t-1")).a;
      expect(Object.keys(await d.lire("sam", "t-1"))).toEqual(["a"]);
    });
  });
}
