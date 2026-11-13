import { ErreurDomaine, type DepotFamille, type FiltrePeriode, type NouvelleDemande } from "./depot";
import { validerRegle } from "../regles/validation";
import type { Regle } from "../regles/types";
import type {
  Creneau,
  DateJour,
  DemandeEchange,
  EntiteJournal,
  EntreeJournal,
  EvenementANotifier,
  Famille,
  Garde,
  Presence,
  Transfert,
} from "./types";

const RE_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const RE_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_COULEUR = /^#[0-9a-fA-F]{6}$/;

/** Vrai si la chaîne est une date calendaire réelle (pas 2026-02-31). */
function dateReelle(d: string): boolean {
  if (!RE_DATE.test(d)) return false;
  const [a, m, j] = d.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(a, m - 1, j));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === j;
}

function validerFamille(f: Famille) {
  if (f.adultes.length !== 2 || f.adultes[0].id === f.adultes[1].id) {
    throw new ErreurDomaine("Une famille compte exactement deux adultes aux ids différents");
  }
  if (new Set(f.enfants.map((e) => e.id)).size !== f.enfants.length) {
    throw new ErreurDomaine("Ids d'enfant en double");
  }
  if (new Set(f.lieux.map((l) => l.id)).size !== f.lieux.length) {
    throw new ErreurDomaine("Ids de lieu en double");
  }
  for (const type of ["domicile_a", "domicile_b"] as const) {
    if (!f.lieux.some((l) => l.type === type)) throw new ErreurDomaine(`Lieu ${type} manquant`);
  }
}

export interface OptionsDepotMemoire {
  /** Horloge injectable (tests). */
  maintenant?: () => Date;
  /** Générateur d'ids injectable (ex. ids uniques et triables pour un stockage partagé). */
  genererId?: (prefixe: string) => string;
}

/** Collections de l'état d'un dépôt ; les clés sont celles des documents (« enfant|date » ou id). */
export interface EtatDepot {
  gardes: Record<string, Garde>;
  presences: Record<string, Presence>;
  transferts: Record<string, Transfert>;
  creneaux: Record<string, Creneau>;
  demandes: Record<string, DemandeEchange>;
  regles: Record<string, Regle>;
  journal: Record<string, EntreeJournal>;
  evenements: Record<string, EvenementANotifier>;
}
export type NomCollection = keyof EtatDepot;

const copie = <T>(v: T): T => structuredClone(v);
const dansPeriode = (date: string, f?: FiltrePeriode) =>
  (!f?.du || date >= f.du) && (!f?.au || date <= f.au);

export class DepotMemoire implements DepotFamille {
  private readonly famille: Famille;
  private readonly maintenant: () => Date;
  private readonly genererId?: (prefixe: string) => string;
  private compteur = 0;
  private gardes = new Map<string, Garde>();
  private presences = new Map<string, Presence>();
  private transferts = new Map<string, Transfert>();
  private creneaux = new Map<string, Creneau>();
  private demandes = new Map<string, DemandeEchange>();
  private regles = new Map<string, Regle>();
  private journal: EntreeJournal[] = [];
  private evenements: EvenementANotifier[] = [];

  constructor(famille: Famille, options: OptionsDepotMemoire = {}) {
    for (const e of famille.enfants) {
      if (!RE_COULEUR.test(e.couleur)) throw new ErreurDomaine(`Couleur invalide pour ${e.prenom}`);
    }
    validerFamille(famille);
    this.famille = copie(famille);
    this.maintenant = options.maintenant ?? (() => new Date());
    this.genererId = options.genererId;
  }

  /** Copie de l'état courant, par collection (sert aux adaptateurs de stockage). */
  exporterEtat(): EtatDepot {
    const obj = <T>(m: Map<string, T>) => Object.fromEntries([...m].map(([k, v]) => [k, copie(v)]));
    const parId = <T extends { id: string }>(l: T[]) => Object.fromEntries(l.map((v) => [v.id, copie(v)]));
    return {
      gardes: obj(this.gardes),
      presences: obj(this.presences),
      transferts: obj(this.transferts),
      creneaux: obj(this.creneaux),
      demandes: obj(this.demandes),
      regles: obj(this.regles),
      journal: parId(this.journal),
      evenements: parId(this.evenements),
    };
  }

  /** Remplace l'état (l'ordre du journal et des événements suit celui de l'objet). */
  restaurerEtat(etat: Partial<EtatDepot>) {
    const map = <T>(o: Record<string, T> | undefined) => new Map(Object.entries(copie(o ?? {})));
    this.gardes = map(etat.gardes);
    this.presences = map(etat.presences);
    this.transferts = map(etat.transferts);
    this.creneaux = map(etat.creneaux);
    this.demandes = map(etat.demandes);
    this.regles = map(etat.regles);
    this.journal = Object.values(copie(etat.journal ?? {}));
    this.evenements = Object.values(copie(etat.evenements ?? {}));
  }

  async lireFamille() {
    return copie(this.famille);
  }

  async listerGardes(f?: FiltrePeriode) {
    return [...this.gardes.values()]
      .filter((g) => (!f?.enfantId || g.enfantId === f.enfantId) && dansPeriode(g.date, f))
      .map(copie);
  }

  async definirGarde(auteurId: string, garde: Garde) {
    this.verifierAdulte(auteurId);
    this.verifierEnfant(garde.enfantId);
    this.verifierDate(garde.date);
    this.verifierAdulte(garde.responsableId);
    this.ecrire(auteurId, "garde", this.gardes, `${garde.enfantId}|${garde.date}`, copie(garde));
  }

  async supprimerGarde(auteurId: string, enfantId: string, date: DateJour) {
    this.verifierAdulte(auteurId);
    this.supprimer(auteurId, "garde", this.gardes, `${enfantId}|${date}`);
  }

  async supprimerPresence(auteurId: string, enfantId: string, date: DateJour) {
    this.verifierAdulte(auteurId);
    this.supprimer(auteurId, "presence", this.presences, `${enfantId}|${date}`);
  }

  async listerPresences(f?: FiltrePeriode) {
    return [...this.presences.values()]
      .filter((p) => (!f?.enfantId || p.enfantId === f.enfantId) && dansPeriode(p.date, f))
      .map(copie);
  }

  async definirPresence(auteurId: string, presence: Presence) {
    this.verifierAdulte(auteurId);
    this.verifierEnfant(presence.enfantId);
    this.verifierDate(presence.date);
    this.verifierLieu(presence.lieuId);
    this.ecrire(auteurId, "presence", this.presences, `${presence.enfantId}|${presence.date}`, copie(presence));
  }

  async listerTransferts(f?: Omit<FiltrePeriode, "enfantId">) {
    return [...this.transferts.values()].filter((t) => dansPeriode(t.date, f)).map(copie);
  }

  async enregistrerTransfert(auteurId: string, t: Omit<Transfert, "id"> & { id?: string }) {
    this.verifierAdulte(auteurId);
    this.verifierDate(t.date);
    if (t.enfantIds.length === 0) throw new ErreurDomaine("Transfert sans enfant");
    t.enfantIds.forEach((e) => this.verifierEnfant(e));
    if (!RE_HEURE.test(t.heure)) throw new ErreurDomaine(`Heure invalide : ${t.heure}`);
    this.verifierLieu(t.lieuId);
    this.verifierAdulte(t.deposeId);
    this.verifierAdulte(t.recupereId);
    const complet: Transfert = { ...copie(t), id: t.id ?? this.nouvelId("tr", this.transferts) };
    this.ecrire(auteurId, "transfert", this.transferts, complet.id, complet);
    return copie(complet);
  }

  async supprimerTransfert(auteurId: string, id: string) {
    this.verifierAdulte(auteurId);
    this.supprimer(auteurId, "transfert", this.transferts, id);
  }

  async listerCreneaux(f?: FiltrePeriode) {
    return [...this.creneaux.values()]
      .filter((c) => (!f?.enfantId || c.enfantId === f.enfantId) && dansPeriode(c.date, f))
      .map(copie);
  }

  async enregistrerCreneau(auteurId: string, c: Omit<Creneau, "id"> & { id?: string }) {
    this.verifierAdulte(auteurId);
    this.verifierEnfant(c.enfantId);
    this.verifierDate(c.date);
    if (!RE_HEURE.test(c.debut) || !RE_HEURE.test(c.fin)) throw new ErreurDomaine("Heure invalide");
    if (c.fin < c.debut) throw new ErreurDomaine("La fin du créneau précède son début");
    const complet: Creneau = { ...copie(c), id: c.id ?? this.nouvelId("cr", this.creneaux) };
    this.ecrire(auteurId, "creneau", this.creneaux, complet.id, complet);
    return copie(complet);
  }

  async supprimerCreneau(auteurId: string, id: string) {
    this.verifierAdulte(auteurId);
    this.supprimer(auteurId, "creneau", this.creneaux, id);
  }

  async listerDemandes() {
    return [...this.demandes.values()].map(copie);
  }

  async proposerEchange(auteurId: string, d: NouvelleDemande) {
    this.verifierAdulte(auteurId);
    this.verifierAdulte(d.responsableId);
    if (d.enfantIds.length === 0 || d.jours.length === 0) throw new ErreurDomaine("Demande vide");
    d.enfantIds.forEach((e) => this.verifierEnfant(e));
    d.jours.forEach((j) => this.verifierDate(j));
    const demande: DemandeEchange = {
      id: this.nouvelId("de", this.demandes),
      statut: "proposee",
      auteurId,
      responsableId: d.responsableId,
      enfantIds: [...d.enfantIds],
      jours: [...d.jours],
      creeLe: this.maintenant().toISOString(),
    };
    this.ecrire(auteurId, "demande", this.demandes, demande.id, demande);
    return copie(demande);
  }

  async repondreEchange(repondeurId: string, demandeId: string, reponse: "acceptee" | "refusee") {
    this.verifierAdulte(repondeurId);
    const demande = this.demandes.get(demandeId);
    if (!demande) throw new ErreurDomaine(`Demande inconnue : ${demandeId}`);
    if (demande.auteurId === repondeurId) {
      throw new ErreurDomaine("Seul l'autre adulte peut répondre à la demande");
    }
    if (demande.statut !== "proposee") throw new ErreurDomaine("Demande déjà traitée");
    // Tout ce qui peut échouer est calculé avant la première écriture.
    const domicile = reponse === "acceptee" ? this.domicileDe(demande.responsableId) : undefined;
    const maj: DemandeEchange = {
      ...demande,
      statut: reponse,
      reponduLe: this.maintenant().toISOString(),
      repondeurId,
    };
    this.ecrire(repondeurId, "demande", this.demandes, demandeId, maj);
    if (domicile !== undefined) {
      for (const enfantId of demande.enfantIds) {
        for (const date of demande.jours) {
          const cle = `${enfantId}|${date}`;
          this.ecrire(repondeurId, "garde", this.gardes, cle, {
            enfantId,
            date,
            responsableId: demande.responsableId,
          });
          this.ecrire(repondeurId, "presence", this.presences, cle, { enfantId, date, lieuId: domicile });
        }
      }
    }
    return copie(maj);
  }

  async listerRegles() {
    return [...this.regles.values()].map(copie);
  }

  async enregistrerRegle(auteurId: string, regle: Regle) {
    this.verifierAdulte(auteurId);
    validerRegle(regle, this.famille);
    if (regle.type === "derivee") {
      const source = this.regles.get(regle.sourceId);
      if (!source) throw new ErreurDomaine(`Règle source inconnue : ${regle.sourceId}`);
      if (source.type === "derivee") throw new ErreurDomaine("Une règle dérivée ne peut pas suivre une autre dérivée");
      if (this.dependantesDe(regle.id).length > 0) {
        throw new ErreurDomaine("Une règle dont d'autres dépendent ne peut pas devenir dérivée");
      }
    }
    const complete = copie(regle);
    this.ecrire(auteurId, "regle", this.regles, complete.id, complete);
    return copie(complete);
  }

  async supprimerRegle(auteurId: string, id: string) {
    this.verifierAdulte(auteurId);
    const dependantes = this.dependantesDe(id);
    if (dependantes.length > 0) {
      throw new ErreurDomaine(`Règle utilisée par : ${dependantes.map((r) => r.id).join(", ")}`);
    }
    this.supprimer(auteurId, "regle", this.regles, id);
  }

  private dependantesDe(id: string) {
    return [...this.regles.values()].filter((r) => r.type === "derivee" && r.sourceId === id);
  }

  async lireJournal() {
    return copie(this.journal);
  }

  async evenementsANotifier(destinataireId: string) {
    return copie(this.evenements.filter((e) => e.destinataireId === destinataireId));
  }

  async marquerNotifie(destinataireId: string, evenementId: string) {
    this.verifierAdulte(destinataireId);
    const ev = this.evenements.find((e) => e.id === evenementId);
    if (!ev) throw new ErreurDomaine(`Événement inconnu : ${evenementId}`);
    if (ev.destinataireId !== destinataireId) {
      throw new ErreurDomaine("Cet événement est destiné à l'autre adulte");
    }
    this.evenements = this.evenements.filter((e) => e.id !== evenementId);
  }

  // --- interne ---

  /** Génère un id ; si `magasin` est fourni, saute les ids déjà pris (fournis par l'appelant). */
  private nouvelId(prefixe: string, magasin?: Map<string, unknown>) {
    let id: string;
    do id = this.genererId ? this.genererId(prefixe) : `${prefixe}-${++this.compteur}`;
    while (magasin?.has(id));
    return id;
  }

  /** Écrit, journalise et crée l'événement pour l'autre adulte. Sans effet si rien ne change. */
  private ecrire<T>(auteurId: string, entite: EntiteJournal, magasin: Map<string, T>, cle: string, valeur: T) {
    const avant = magasin.get(cle);
    if (avant !== undefined && JSON.stringify(avant) === JSON.stringify(valeur)) return;
    magasin.set(cle, valeur);
    this.tracer(auteurId, entite, cle, avant === undefined ? "creation" : "modification", avant, valeur);
  }

  private supprimer<T>(auteurId: string, entite: EntiteJournal, magasin: Map<string, T>, cle: string) {
    const avant = magasin.get(cle);
    if (avant === undefined) throw new ErreurDomaine(`Introuvable : ${cle}`);
    magasin.delete(cle);
    this.tracer(auteurId, entite, cle, "suppression", avant, undefined);
  }

  private tracer(
    auteurId: string,
    entite: EntiteJournal,
    cle: string,
    action: EntreeJournal["action"],
    avant: unknown,
    apres: unknown,
  ) {
    const quand = this.maintenant().toISOString();
    const entree: EntreeJournal = {
      id: this.nouvelId("jn"),
      auteurId,
      quand,
      entite,
      cle,
      action,
      avant: avant === undefined ? undefined : copie(avant),
      apres: apres === undefined ? undefined : copie(apres),
    };
    this.journal.push(entree);
    const autre = this.famille.adultes.find((a) => a.id !== auteurId);
    if (!autre) return;
    this.evenements.push({ id: this.nouvelId("ev"), entreeId: entree.id, destinataireId: autre.id, quand });
  }

  private domicileDe(adulteId: string) {
    const type = this.famille.adultes[0].id === adulteId ? "domicile_a" : "domicile_b";
    const lieu = this.famille.lieux.find((l) => l.type === type);
    if (!lieu) throw new ErreurDomaine(`Aucun lieu ${type} dans la famille`);
    return lieu.id;
  }

  private verifierAdulte(id: string) {
    if (!this.famille.adultes.some((a) => a.id === id)) throw new ErreurDomaine(`Adulte inconnu : ${id}`);
  }
  private verifierEnfant(id: string) {
    if (!this.famille.enfants.some((e) => e.id === id)) throw new ErreurDomaine(`Enfant inconnu : ${id}`);
  }
  private verifierLieu(id: string) {
    if (!this.famille.lieux.some((l) => l.id === id)) throw new ErreurDomaine(`Lieu inconnu : ${id}`);
  }
  private verifierDate(d: string) {
    if (!dateReelle(d)) throw new ErreurDomaine(`Date invalide : ${d}`);
  }
}
