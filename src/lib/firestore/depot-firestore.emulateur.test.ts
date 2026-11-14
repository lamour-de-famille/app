import { describe } from "vitest";
import { suiteContratDepot } from "../domaine/depot-contrat";
import { BanqueFirestore } from "./banque-firestore";
import { DepotFirestore } from "./depot-firestore";
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
});
