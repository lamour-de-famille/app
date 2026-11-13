import { describe, expect, it } from "vitest";
import { ErreurDomaine } from "../domaine/depot";
import { StockageEtatMemoire } from "../agenda/types";
import { BanqueMemoire } from "./banque-memoire";
import { StockageEtatFirestore } from "./etat-synchro-firestore";
import { suiteStockageEtat } from "./etat-synchro.contrat";

describe("StockageEtatMemoire", () => {
  suiteStockageEtat(async () => new StockageEtatMemoire());
});

describe("StockageEtatFirestore sur banque en mémoire", () => {
  suiteStockageEtat(async () => new StockageEtatFirestore(new BanqueMemoire(), "fam-etat"));
});

describe("StockageEtatFirestore : identifiant de famille", () => {
  it("refuse un identifiant de famille impropre", () => {
    for (const id of ["", "a/b", "..", "__x__"]) {
      expect(() => new StockageEtatFirestore(new BanqueMemoire(), id)).toThrow(ErreurDomaine);
    }
  });
});
