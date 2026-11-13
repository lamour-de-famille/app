import fixture from "./fixture-calendrier.json";
import { ErreurVacances, type ClientVacances, type EnregistrementBrut } from "./types";

/** Doublure : lit la fixture locale (ou une liste fournie), ou échoue à la demande. Aucun réseau. */
export class ClientVacancesDoublure implements ClientVacances {
  constructor(
    readonly donnees: EnregistrementBrut[] = fixture.results as EnregistrementBrut[],
    private readonly echec = false,
  ) {}

  async recuperer(): Promise<EnregistrementBrut[]> {
    if (this.echec) throw new ErreurVacances("Service des vacances injoignable");
    return structuredClone(this.donnees);
  }
}
