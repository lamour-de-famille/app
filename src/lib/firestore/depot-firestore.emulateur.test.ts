import { describe } from "vitest";
import { suiteContratDepot } from "../domaine/depot-contrat";
import { BanqueFirestore } from "./banque-firestore";
import { DepotFirestore } from "./depot-firestore";
import { suiteNotesFamille } from "../dictee/notes.contrat";
import { suiteStockagePropositions } from "../dictee/stockage-propositions.contrat";
import { suiteStockageUsageIA } from "../ia/stockage-usage.contrat";
import { suiteDepotTaches } from "../taches/depot-contrat";
import { DepotTachesFirestore } from "./depot-taches-firestore";
import { NotesFamilleFirestore } from "./notes-firestore";
import { StockagePropositionsFirestore } from "./propositions-firestore";
import { StockageUsageIAFirestore } from "./usage-ia-firestore";
import { StockageEtatFirestore } from "./etat-synchro-firestore";
import { suiteStockageEtat } from "./etat-synchro.contrat";

/** Lancé par `npm run test:emulateur` ; ignoré sans FIRESTORE_EMULATOR_HOST (aucun appel réseau sinon). */
const actif = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!actif)("Firestore (émulateur)", () => {
  let banque: BanqueFirestore | undefined;
  const ouvrir = async () => {
    if (!banque) {
      const { Firestore } = await import("@google-cloud/firestore");
      banque = new BanqueFirestore(new Firestore({ projectId: "demo-lamour-test" }));
    }
    return banque;
  };
  const unique = () => `fam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  describe("DepotFirestore : contrat", () => {
    suiteContratDepot(async (famille, maintenant) => {
      const depot = new DepotFirestore(await ouvrir(), unique(), { maintenant });
      await depot.initialiserFamille(famille);
      return depot;
    });
  });

  describe("StockageEtatFirestore", () => {
    suiteStockageEtat(async () => new StockageEtatFirestore(await ouvrir(), unique()));
  });

  describe("DepotTachesFirestore : contrat", () => {
    suiteDepotTaches(async (famille, maintenant) => {
      const banque = await ouvrir();
      const id = unique();
      await new DepotFirestore(banque, id).initialiserFamille(famille);
      return new DepotTachesFirestore(banque, id, { maintenant });
    });
  });

  describe("NotesFamilleFirestore : contrat", () => {
    suiteNotesFamille(async (maintenant) => new NotesFamilleFirestore(await ouvrir(), unique(), maintenant));
  });

  describe("StockagePropositionsFirestore : contrat", () => {
    suiteStockagePropositions(async (maintenant) => new StockagePropositionsFirestore(await ouvrir(), unique(), maintenant));
  });

  describe("StockageUsageIAFirestore : contrat (incréments concurrents réels)", () => {
    suiteStockageUsageIA(async () => new StockageUsageIAFirestore(await ouvrir(), unique()));
  });
});
