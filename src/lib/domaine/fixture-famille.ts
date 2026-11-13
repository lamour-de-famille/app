import type { Famille } from "./types";

/** Famille entièrement fictive pour les tests et la démonstration. */
export const familleFictive: Famille = {
  id: "famille-demo",
  nom: "Famille Démo",
  adultes: [
    { id: "alex", prenom: "Alex", role: "parent" },
    { id: "sam", prenom: "Sam", role: "beau-parent" },
  ],
  enfants: [
    { id: "leo", prenom: "Léo", couleur: "#3b82f6" },
    { id: "mila", prenom: "Mila", couleur: "#ec4899" },
    { id: "nina", prenom: "Nina", couleur: "#22c55e" },
  ],
  lieux: [
    { id: "ecole", type: "ecole", libelle: "École du Tilleul" },
    { id: "dom-alex", type: "domicile_a", libelle: "Chez Alex" },
    { id: "dom-sam", type: "domicile_b", libelle: "Chez Sam" },
    { id: "parc", type: "autre", libelle: "Parc municipal" },
  ],
};
