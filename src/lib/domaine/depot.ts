import type {
  Creneau,
  DateJour,
  DemandeEchange,
  EntreeJournal,
  EvenementANotifier,
  Famille,
  Garde,
  Presence,
  Transfert,
} from "./types";
import type { Regle } from "../regles/types";

export class ErreurDomaine extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurDomaine";
  }
}

export interface FiltrePeriode {
  enfantId?: string;
  /** Bornes incluses. */
  du?: DateJour;
  au?: DateJour;
}

export interface NouvelleDemande {
  responsableId: string;
  enfantIds: string[];
  jours: DateJour[];
}

/**
 * Accès aux données de la famille. Les deux adultes voient et modifient tout ;
 * chaque écriture reçoit l'auteur, est journalisée et génère un événement
 * à notifier pour l'autre adulte.
 */
export interface DepotFamille {
  lireFamille(): Promise<Famille>;

  listerGardes(filtre?: FiltrePeriode): Promise<Garde[]>;
  definirGarde(auteurId: string, garde: Garde): Promise<void>;

  listerPresences(filtre?: FiltrePeriode): Promise<Presence[]>;
  definirPresence(auteurId: string, presence: Presence): Promise<void>;

  listerTransferts(filtre?: Omit<FiltrePeriode, "enfantId">): Promise<Transfert[]>;
  /** Crée (sans id) ou remplace (avec id) ; retourne le transfert enregistré. */
  enregistrerTransfert(
    auteurId: string,
    transfert: Omit<Transfert, "id"> & { id?: string },
  ): Promise<Transfert>;
  supprimerTransfert(auteurId: string, id: string): Promise<void>;

  listerCreneaux(filtre?: FiltrePeriode): Promise<Creneau[]>;
  enregistrerCreneau(auteurId: string, creneau: Omit<Creneau, "id"> & { id?: string }): Promise<Creneau>;
  supprimerCreneau(auteurId: string, id: string): Promise<void>;

  listerDemandes(): Promise<DemandeEchange[]>;
  proposerEchange(auteurId: string, demande: NouvelleDemande): Promise<DemandeEchange>;
  /** Seul l'autre adulte (différent de l'auteur de la demande) peut répondre à une demande « proposee ». */
  repondreEchange(
    repondeurId: string,
    demandeId: string,
    reponse: "acceptee" | "refusee",
  ): Promise<DemandeEchange>;

  /** Règles de planning : données sérialisables, validées à l'écriture. Le remplacement se fait par id. */
  listerRegles(): Promise<Regle[]>;
  enregistrerRegle(auteurId: string, regle: Regle): Promise<Regle>;
  /** Refusé si une règle dérivée en dépend. */
  supprimerRegle(auteurId: string, id: string): Promise<void>;

  lireJournal(): Promise<EntreeJournal[]>;
  /** Événements non encore consommés pour cet adulte. */
  evenementsANotifier(destinataireId: string): Promise<EvenementANotifier[]>;
  /** Seul le destinataire de l'événement peut l'acquitter. */
  marquerNotifie(destinataireId: string, evenementId: string): Promise<void>;
}
