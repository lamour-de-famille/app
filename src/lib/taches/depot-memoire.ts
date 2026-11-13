import { ErreurDomaine } from "../domaine/depot";
import type { DateJour, Famille } from "../domaine/types";
import { cleOccurrence } from "./types";
import { dateReelle, datesRecurrence } from "./occurrences";
import type { DepotTaches } from "./depot";
import type { AccuseTache, NouvelleTache, Tache } from "./types";

export { dateReelle };

const copie = <T>(v: T): T => structuredClone(v);

export interface OptionsDepotTachesMemoire {
  /** Horloge injectable (tests). */
  maintenant?: () => Date;
}

export class DepotTachesMemoire implements DepotTaches {
  private taches = new Map<string, Tache>();
  private compteur = 0;
  private readonly maintenant: () => Date;

  constructor(
    private readonly famille: Famille,
    options: OptionsDepotTachesMemoire = {},
  ) {
    this.maintenant = options.maintenant ?? (() => new Date());
  }

  private verifierAdulte(id: string, role: string) {
    if (!this.famille.adultes.some((a) => a.id === id)) throw new ErreurDomaine(`${role} inconnu : ${id}`);
  }

  private valider(auteurId: string, t: NouvelleTache) {
    this.verifierAdulte(auteurId, "Auteur");
    this.verifierAdulte(t.assigneId, "Adulte assigné");
    if (typeof t.titre !== "string" || t.titre.trim() === "") throw new ErreurDomaine("Titre vide");
    if (t.enfantId !== undefined && !this.famille.enfants.some((e) => e.id === t.enfantId)) {
      throw new ErreurDomaine(`Enfant inconnu : ${t.enfantId}`);
    }
    if (t.echeance !== undefined && !dateReelle(t.echeance)) throw new ErreurDomaine(`Échéance invalide : ${t.echeance}`);
    const r = t.recurrence;
    if (r) {
      if (!t.echeance) throw new ErreurDomaine("Une tâche récurrente a besoin d'une échéance (ancre)");
      if (!["quotidienne", "hebdomadaire", "mensuelle"].includes(r.frequence)) throw new ErreurDomaine("Fréquence inconnue");
      if (!Number.isInteger(r.intervalle) || r.intervalle < 1) throw new ErreurDomaine("Intervalle : entier >= 1");
      if (r.fin !== undefined && (!dateReelle(r.fin) || r.fin < t.echeance)) throw new ErreurDomaine("Fin de récurrence invalide");
    }
  }

  private estOccurrence(t: Tache, date: DateJour): boolean {
    return !!t.recurrence && !!t.echeance && datesRecurrence(t.echeance, t.recurrence, date, date).length === 1;
  }

  async lister(): Promise<Tache[]> {
    return copie([...this.taches.values()]);
  }

  async enregistrer(auteurId: string, nouvelle: NouvelleTache): Promise<AccuseTache> {
    this.valider(auteurId, nouvelle);
    const existante = nouvelle.id ? this.taches.get(nouvelle.id) : undefined;
    if (nouvelle.id && !existante) throw new ErreurDomaine(`Tâche inconnue : ${nouvelle.id}`);
    const id = nouvelle.id ?? `tache-${++this.compteur}`;
    // Liste blanche : rien d'autre que ces champs ne vient de l'appelant.
    const r = nouvelle.recurrence;
    const champs: Omit<Tache, "statut" | "creeParId"> = {
      id,
      titre: nouvelle.titre,
      assigneId: nouvelle.assigneId,
      ...(nouvelle.echeance !== undefined ? { echeance: nouvelle.echeance } : {}),
      ...(r ? { recurrence: { frequence: r.frequence, intervalle: r.intervalle, ...(r.fin !== undefined ? { fin: r.fin } : {}) } } : {}),
      ...(nouvelle.enfantId !== undefined ? { enfantId: nouvelle.enfantId } : {}),
    };
    const tache: Tache = existante
      ? { ...existante, ...champs }
      : { ...champs, statut: "a_faire", creeParId: auteurId };
    if (existante) {
      // Passage ponctuelle <-> série : l'ancien statut n'a plus de sens.
      if (!!existante.recurrence !== !!tache.recurrence) {
        tache.statut = "a_faire";
        delete tache.faiteLe;
      }
      // Les champs optionnels absents de la saisie sont retirés (remplacement des champs saisis).
      for (const k of ["echeance", "recurrence", "enfantId"] as const) if (!(k in champs)) delete tache[k];
      // Les exceptions qui ne correspondent plus à la série sont écartées.
      if (!tache.recurrence) delete tache.exceptions;
      else if (tache.exceptions) tache.exceptions = tache.exceptions.filter((e) => this.estOccurrence(tache, e.date));
    }
    this.taches.set(id, tache);
    return { id };
  }

  async supprimer(auteurId: string, id: string): Promise<void> {
    this.verifierAdulte(auteurId, "Auteur");
    if (!this.taches.delete(id)) throw new ErreurDomaine(`Tâche inconnue : ${id}`);
  }

  /** Jour courant (fuseau Europe/Paris), au format AAAA-MM-JJ. */
  private aujourdhui(): DateJour {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(this.maintenant());
  }

  private modifierStatut(auteurId: string, tacheId: string, date: DateJour | undefined, faite: boolean): AccuseTache {
    this.verifierAdulte(auteurId, "Auteur");
    const t = this.taches.get(tacheId);
    if (!t) throw new ErreurDomaine(`Tâche inconnue : ${tacheId}`);
    if (date !== undefined && !dateReelle(date)) throw new ErreurDomaine(`Date invalide : ${String(date)}`);
    // Le passé d'une tâche n'est modifiable que par son assigné ; refus identique que la date existe ou non (pas d'oracle).
    const visee = t.recurrence ? date : t.echeance;
    if (t.assigneId !== auteurId && visee !== undefined && visee < this.aujourdhui()) {
      throw new ErreurDomaine("Occurrence antérieure à aujourd'hui : action réservée à l'adulte assigné");
    }
    if (t.recurrence) {
      if (date === undefined || !this.estOccurrence(t, date)) throw new ErreurDomaine("Date : occurrence inexistante de la série");
      const autres = (t.exceptions ?? []).filter((e) => e.date !== date);
      const liste = faite ? [...autres, { date, faiteLe: this.maintenant().toISOString() }] : autres;
      t.exceptions = liste.sort((a, b) => a.date.localeCompare(b.date));
    } else {
      if (date !== undefined) throw new ErreurDomaine("Tâche ponctuelle : pas de date d'occurrence");
      t.statut = faite ? "faite" : "a_faire";
      if (faite) t.faiteLe = this.maintenant().toISOString();
      else delete t.faiteLe;
    }
    return { id: t.id, ...(date !== undefined ? { cle: cleOccurrence(t.id, date) } : {}) };
  }

  async cocher(auteurId: string, tacheId: string, date?: DateJour): Promise<AccuseTache> {
    return this.modifierStatut(auteurId, tacheId, date, true);
  }

  async decocher(auteurId: string, tacheId: string, date?: DateJour): Promise<AccuseTache> {
    return this.modifierStatut(auteurId, tacheId, date, false);
  }
}
