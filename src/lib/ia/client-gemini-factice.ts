import type { ClientGemini, DemandeDictee, DemandeRedaction, SortieDictee, UsageIA } from "./types";

export interface OptionsFactice {
  sortie?: SortieDictee;
  usage?: UsageIA;
  /** Si défini, les appels échouent avec cette erreur. */
  erreur?: Error;
}

const SORTIE_PAR_DEFAUT: SortieDictee = { transcription: "Dictée fictive.", taches: [], rendezVous: [], notes: [] };

/** Doublure déterministe : aucune requête réseau. Garde la trace des appels. */
export class ClientGeminiFactice implements ClientGemini {
  readonly appelsDictee: DemandeDictee[] = [];
  readonly appelsRedaction: DemandeRedaction[] = [];
  constructor(private readonly options: OptionsFactice = {}) {}

  private usage(): UsageIA {
    return this.options.usage ?? { jetonsEntree: 100, jetonsSortie: 50 };
  }

  async traiterDictee(demande: DemandeDictee) {
    this.appelsDictee.push(demande);
    if (this.options.erreur) throw this.options.erreur;
    return { resultat: structuredClone(this.options.sortie ?? SORTIE_PAR_DEFAUT), usage: this.usage() };
  }

  async rediger(demande: DemandeRedaction) {
    this.appelsRedaction.push(demande);
    if (this.options.erreur) throw this.options.erreur;
    return { texte: `Rédaction fictive : ${demande.consigne}`, usage: this.usage() };
  }
}
