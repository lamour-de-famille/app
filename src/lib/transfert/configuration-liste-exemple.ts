import type { ConfigurationListe } from "./liste";

/**
 * Configuration d'exemple, entièrement fictive : valeur de départ à stocker en base puis à faire
 * modifier par les adultes. La logique de `listeDuTransfert` n'en dépend pas.
 */
export const CONFIGURATION_LISTE_EXEMPLE: ConfigurationListe = {
  baseCommune: [{ code: "cartable", libelle: "Cartable" }],
  baseParEnfant: {
    leo: [{ code: "carnet-liaison", libelle: "Cahier de liaison" }],
    mila: [{ code: "doudou", libelle: "Doudou" }],
    nina: [
      { code: "doudou", libelle: "Doudou" },
      { code: "trousse-toilette", libelle: "Trousse de toilette" },
    ],
  },
  correspondances: [
    { motif: "sport", moment: "les-deux", elements: [{ code: "tenue-sport", libelle: "Tenue de sport" }] },
    { motif: "natation", moment: "les-deux", elements: [{ code: "maillot-bain", libelle: "Maillot de bain" }, { code: "serviette", libelle: "Serviette" }] },
    { motif: "musique", moment: "lendemain", elements: [{ code: "instrument", libelle: "Instrument" }] },
  ],
};
