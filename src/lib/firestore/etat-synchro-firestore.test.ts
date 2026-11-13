import { describe } from "vitest";
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
