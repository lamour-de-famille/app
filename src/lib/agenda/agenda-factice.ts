import {
  ErreurAutorisationExpiree,
  type ClientAgenda,
  type EvenementAgenda,
  type FiltreListe,
  type NouvelEvenement,
} from "./types";

export interface AppelFactice {
  action: "lister" | "creer" | "mettreAJour" | "supprimer";
  agendaId: string;
  id?: string;
}

/** Doublure en mémoire : peut contenir des événements étrangers et simuler l'expiration de l'autorisation. */
export class AgendaFactice implements ClientAgenda {
  private readonly agendas = new Map<string, Map<string, EvenementAgenda>>();
  private compteur = 0;
  private expire = false;
  private creations = 0;
  readonly appels: AppelFactice[] = [];
  /** Si défini, l'autorisation expire une fois ce nombre de créations atteint (coupure en cours de synchro). */
  expirerApresCreations?: number;

  private agenda(agendaId: string) {
    let a = this.agendas.get(agendaId);
    if (!a) this.agendas.set(agendaId, (a = new Map()));
    return a;
  }

  private entrer(action: AppelFactice["action"], agendaId: string, id?: string) {
    this.appels.push({ action, agendaId, id });
    if (this.expire) throw new ErreurAutorisationExpiree();
  }

  /** Ajoute un événement qui n'appartient pas à l'application (sans marque, ou avec une autre). */
  ajouterEtranger(agendaId: string, evenement: NouvelEvenement): EvenementAgenda {
    const e = { ...structuredClone(evenement), id: `etranger-${++this.compteur}` };
    this.agenda(agendaId).set(e.id, e);
    return structuredClone(e);
  }

  expirerAutorisation() {
    this.expire = true;
  }
  retablirAutorisation() {
    this.expire = false;
    this.expirerApresCreations = undefined;
  }

  /** Lecture directe, sans passer par l'API ni l'enregistrer (pour les assertions). */
  contenu(agendaId: string): EvenementAgenda[] {
    return structuredClone([...this.agenda(agendaId).values()]);
  }

  async lister(agendaId: string, filtre?: FiltreListe) {
    this.entrer("lister", agendaId);
    const voulu = Object.entries(filtre?.proprietesPrivees ?? {});
    return this.contenu(agendaId).filter((e) => voulu.every(([k, v]) => e.proprietesPrivees[k] === v));
  }

  async creer(agendaId: string, evenement: NouvelEvenement) {
    if (this.expirerApresCreations !== undefined && this.creations >= this.expirerApresCreations) this.expire = true;
    this.entrer("creer", agendaId);
    this.creations++;
    const e = { ...structuredClone(evenement), id: `ev-${++this.compteur}` };
    this.agenda(agendaId).set(e.id, e);
    return structuredClone(e);
  }

  async mettreAJour(agendaId: string, id: string, evenement: NouvelEvenement) {
    this.entrer("mettreAJour", agendaId, id);
    if (!this.agenda(agendaId).has(id)) throw new Error(`Événement inconnu : ${id}`);
    const e = { ...structuredClone(evenement), id };
    this.agenda(agendaId).set(id, e);
    return structuredClone(e);
  }

  async supprimer(agendaId: string, id: string) {
    this.entrer("supprimer", agendaId, id);
    this.agenda(agendaId).delete(id);
  }
}
