/** Contrats des notifications web push (aucun SMS, aucun appel). */
import type { EvenementANotifier } from "../domaine/types";

/** Abonnement push d'un appareil (forme standard PushSubscription.toJSON()). */
export interface AbonnementPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Un adulte peut avoir plusieurs appareils ; un endpoint n'appartient qu'à un seul adulte. */
export interface StockageAbonnements {
  /** Enregistre l'appareil ; si l'endpoint était rattaché à un autre adulte, il lui est retiré. */
  ajouter(adulteId: string, abonnement: AbonnementPush): Promise<void>;
  lister(adulteId: string): Promise<AbonnementPush[]>;
  retirer(adulteId: string, endpoint: string): Promise<void>;
}

/** Levée par un envoyeur quand l'abonnement n'existe plus (HTTP 404 ou 410). */
export class AbonnementExpire extends Error {
  constructor(public readonly endpoint: string) {
    super("Abonnement push expiré.");
    this.name = "AbonnementExpire";
  }
}

export interface ContenuPush {
  titre: string;
  /** 120 caractères au plus. */
  corps: string;
}

export interface EnvoyeurPush {
  /** Lève AbonnementExpire si l'appareil ne reçoit plus ; toute autre erreur est une panne transitoire. */
  envoyer(abonnement: AbonnementPush, contenu: ContenuPush): Promise<void>;
}

/** Notification refusée par le plafond quotidien, gardée pour le récapitulatif. */
export interface ElementRegroupe {
  destinataireId: string;
  /** AAAA-MM-JJ (Europe/Paris) du jour où l'envoi a été refusé. */
  jour: string;
  texte: string;
  evenementId?: string;
}

export interface FileRegroupement {
  ajouter(element: ElementRegroupe): Promise<void>;
  lister(destinataireId: string): Promise<ElementRegroupe[]>;
  /** Rend et retire les éléments du destinataire (pour construire le récapitulatif). */
  vider(destinataireId: string): Promise<ElementRegroupe[]>;
}

/** Compteur quotidien par destinataire ; la réservation est atomique. */
export interface StockageCompteurNotifications {
  /** Incrémente si le total reste <= max et rend true ; sinon rend false sans rien changer. */
  reserver(cle: string, max: number): Promise<boolean>;
  liberer(cle: string): Promise<void>;
  lire(cle: string): Promise<number>;
}

export interface DemandeNotification {
  destinataireId: string;
  /** Événement du dépôt (DepotFamille.evenementsANotifier) : son destinataire doit être `destinataireId`. */
  evenement?: EvenementANotifier;
  /** Sujet court sans donnée sensible superflue (ex. « nouvelle tâche pour Léo »). */
  sujet?: string;
}

export type ResultatNotification =
  | { statut: "envoyee"; texte: string; source: "gemini" | "repli"; appareils: number }
  | { statut: "regroupee"; texte: string }
  | { statut: "aucun_abonnement" }
  | { statut: "echec_envoi" };
