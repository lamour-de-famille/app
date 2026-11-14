import { AbonnementExpire, type AbonnementPush, type ContenuPush, type EnvoyeurPush } from "./types";

/** Doublure : enregistre les envois, aucun réseau. */
export class EnvoyeurPushFactice implements EnvoyeurPush {
  readonly envois: { abonnement: AbonnementPush; contenu: ContenuPush }[] = [];
  /** Endpoints dont l'envoi échoue comme un abonnement expiré (410). */
  readonly expires = new Set<string>();
  /** Endpoints dont l'envoi échoue par une panne transitoire. */
  readonly enPanne = new Set<string>();

  async envoyer(abonnement: AbonnementPush, contenu: ContenuPush) {
    if (this.expires.has(abonnement.endpoint)) throw new AbonnementExpire(abonnement.endpoint);
    if (this.enPanne.has(abonnement.endpoint)) throw new Error("Panne du service push.");
    this.envois.push({ abonnement, contenu });
  }
}
