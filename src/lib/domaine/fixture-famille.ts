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
    { id: "leo", prenom: "Léo", couleur: "#1E6BFF" },
    { id: "mila", prenom: "Mila", couleur: "#FF2E88" },
    { id: "nina", prenom: "Nina", couleur: "#009A58" },
  ],
  lieux: [
    { id: "ecole", type: "ecole", libelle: "École du Tilleul" },
    { id: "dom-alex", type: "domicile_a", libelle: "Chez Alex" },
    { id: "dom-sam", type: "domicile_b", libelle: "Chez Sam" },
    { id: "parc", type: "autre", libelle: "Parc municipal" },
    { id: "grands-parents", type: "autre", libelle: "Chez les grands-parents" },
  ],
};
