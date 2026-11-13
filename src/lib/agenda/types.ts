/** Valeur de `extendedProperties.private.application` posée sur chaque événement créé par l'application. */
export const MARQUE_APPLICATION = "lamour-de-famille";
export const FUSEAU = "Europe/Paris";

/**
 * Événement voulu pour un adulte. `debut` et `fin` valent soit « AAAA-MM-JJ » (journée entière,
 * `fin` exclusive), soit « AAAA-MM-JJTHH:MM » (heure réglée dans le fuseau de la famille).
 */
export interface EvenementSouhaite {
  /** Clé stable : identifie l'événement d'une synchro à l'autre. */
  cle: string;
  titre: string;
  description?: string;
  lieu?: string;
  debut: string;
  fin: string;
}

/** Événement tel que le client d'agenda le voit (le nôtre ou un événement étranger). */
export interface EvenementAgenda {
  id: string;
  titre: string;
  description?: string;
  lieu?: string;
  debut: string;
  fin: string;
  /** Reflet de `extendedProperties.private`. */
  proprietesPrivees: Record<string, string>;
}

export type NouvelEvenement = Omit<EvenementAgenda, "id">;

/** Levée quand l'autorisation Google est expirée ou révoquée (HTTP 401 ou `invalid_grant`). */
export class ErreurAutorisationExpiree extends Error {
  constructor(message = "Autorisation Google expirée ou révoquée") {
    super(message);
    this.name = "ErreurAutorisationExpiree";
  }
}

export interface FiltreListe {
  /** Ne retourner que les événements dont ces propriétés privées correspondent. */
  proprietesPrivees?: Record<string, string>;
}

/** Accès aux événements d'un agenda. Les implémentations réelles ne sont jamais appelées en test. */
export interface ClientAgenda {
  lister(agendaId: string, filtre?: FiltreListe): Promise<EvenementAgenda[]>;
  creer(agendaId: string, evenement: NouvelEvenement): Promise<EvenementAgenda>;
  mettreAJour(agendaId: string, id: string, evenement: NouvelEvenement): Promise<EvenementAgenda>;
  supprimer(agendaId: string, id: string): Promise<void>;
}

export type StatutSynchro = "jamais" | "ok" | "erreur" | "a_reconnecter";

/** État visible de la synchro d'un adulte. */
export interface EtatSynchro {
  adulteId: string;
  statut: StatutSynchro;
  /** Horodatage ISO du dernier passage entièrement réussi. */
  dernierSucces?: string;
  derniereTentative?: string;
  /** Messages des erreurs du dernier passage (jamais de secret). */
  erreurs: string[];
  /** Nombre d'événements gérés par l'application dans l'agenda après le dernier passage. */
  nombreElements: number;
  crees: number;
  modifies: number;
  supprimes: number;
}

export interface StockageEtatSynchro {
  lire(adulteId: string): Promise<EtatSynchro | undefined>;
  ecrire(etat: EtatSynchro): Promise<void>;
}

export class StockageEtatMemoire implements StockageEtatSynchro {
  private readonly etats = new Map<string, EtatSynchro>();
  async lire(adulteId: string) {
    const e = this.etats.get(adulteId);
    return e ? structuredClone(e) : undefined;
  }
  async ecrire(etat: EtatSynchro) {
    this.etats.set(etat.adulteId, structuredClone(etat));
  }
}
