import { ErreurAutorisationExpiree } from "../agenda/types";
import type { ClientTasks, NouvelleTacheGoogle, TacheGoogle } from "./types";

export interface AppelTasks {
  action: "idListe" | "lister" | "creer" | "mettreAJour" | "supprimer";
  listeId?: string;
  id?: string;
}

/** Doublure en mémoire : accepte des tâches étrangères, des coches, et simule l'expiration de l'autorisation. */
export class TasksFactice implements ClientTasks {
  private readonly listes = new Map<string, Map<string, TacheGoogle>>();
  private readonly titres = new Map<string, string>();
  private compteur = 0;
  private expire = false;
  private creations = 0;
  readonly appels: AppelTasks[] = [];
  /** Si défini, l'autorisation expire une fois ce nombre de créations atteint (coupure en cours de synchro). */
  expirerApresCreations?: number;

  private liste(id: string) {
    let l = this.listes.get(id);
    if (!l) this.listes.set(id, (l = new Map()));
    return l;
  }
  private entrer(a: AppelTasks) {
    this.appels.push(a);
    if (this.expire) throw new ErreurAutorisationExpiree();
  }

  ajouterEtrangere(listeId: string, t: NouvelleTacheGoogle): TacheGoogle {
    const e: TacheGoogle = { ...structuredClone(t), id: `etrangere-${++this.compteur}`, terminee: false };
    this.liste(listeId).set(e.id, e);
    return structuredClone(e);
  }
  /** Simule une coche faite par l'adulte dans Google Tasks. */
  terminer(listeId: string, id: string, terminee = true) {
    this.liste(listeId).get(id)!.terminee = terminee;
  }
  expirerAutorisation() {
    this.expire = true;
  }
  retablirAutorisation() {
    this.expire = false;
    this.expirerApresCreations = undefined;
  }
  /** Lecture directe, sans passer par l'API ni l'enregistrer (pour les assertions). */
  contenu(listeId: string): TacheGoogle[] {
    return structuredClone([...this.liste(listeId).values()]);
  }

  async idListe(titre: string) {
    this.entrer({ action: "idListe" });
    let id = this.titres.get(titre);
    if (!id) this.titres.set(titre, (id = `liste-${++this.compteur}`));
    return id;
  }
  async lister(listeId: string) {
    this.entrer({ action: "lister", listeId });
    return this.contenu(listeId);
  }
  async creer(listeId: string, t: NouvelleTacheGoogle) {
    if (this.expirerApresCreations !== undefined && this.creations >= this.expirerApresCreations) this.expire = true;
    this.entrer({ action: "creer", listeId });
    this.creations++;
    const e: TacheGoogle = { ...structuredClone(t), id: `tg-${++this.compteur}`, terminee: false };
    this.liste(listeId).set(e.id, e);
    return structuredClone(e);
  }
  async mettreAJour(listeId: string, id: string, t: NouvelleTacheGoogle) {
    this.entrer({ action: "mettreAJour", listeId, id });
    const avant = this.liste(listeId).get(id);
    if (!avant) throw new Error(`Tâche inconnue : ${id}`);
    const e: TacheGoogle = { ...structuredClone(t), id, terminee: avant.terminee };
    this.liste(listeId).set(id, e);
    return structuredClone(e);
  }
  async supprimer(listeId: string, id: string) {
    this.entrer({ action: "supprimer", listeId, id });
    this.liste(listeId).delete(id);
  }
}
