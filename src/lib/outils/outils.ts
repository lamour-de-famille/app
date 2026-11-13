import { ErreurDomaine, type DepotFamille } from "../domaine/depot";
import type { DateJour, Famille, Garde, Presence } from "../domaine/types";
import { ajouterJours, jourIso, plage, versMs } from "../regles/dates";

/**
 * Outils rapides de planning. Les saisies produites n'ont jamais la marque
 * `origine: "regle"` : les règles ne les écrasent ni ne les retirent.
 * Chaque outil valide tout avant la première écriture (atomicité vis-à-vis
 * des erreurs de saisie) ; le journal et les notifications viennent du dépôt.
 */

/** Un jour d'un motif cyclique : qui est responsable et où l'enfant dort. */
export interface JourMotif {
  responsableId: string;
  lieuId: string;
}

/** Garde-fou contre une plage saisie par erreur ; ce n'est pas une règle métier. */
export const MAX_JOURS_MOTIF = 366;

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function verifierDate(d: DateJour): void {
  if (!RE_DATE.test(d) || new Date(versMs(d)).toISOString().slice(0, 10) !== d) {
    throw new ErreurDomaine(`Date invalide : ${d}`);
  }
}

function verifierAdulte(famille: Famille, id: string): void {
  if (!famille.adultes.some((a) => a.id === id)) throw new ErreurDomaine(`Adulte inconnu : ${id}`);
}

function verifierEnfants(famille: Famille, ids: string[]): void {
  if (ids.length === 0) throw new ErreurDomaine("Aucun enfant concerné");
  for (const id of ids) {
    if (!famille.enfants.some((e) => e.id === id)) throw new ErreurDomaine(`Enfant inconnu : ${id}`);
  }
}

function verifierLundi(d: DateJour): void {
  verifierDate(d);
  if (jourIso(d) !== 1) throw new ErreurDomaine(`${d} n'est pas un lundi`);
}

const sansMarque = <T extends Garde | Presence>(x: T): T => {
  const copie: T = { ...x };
  delete copie.origine;
  return copie;
};

const cle = (enfantId: string, date: DateJour) => `${enfantId}|${date}`;
const memeContenu = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

type Ecriture = () => Promise<unknown>;

async function executer(ecritures: Ecriture[]): Promise<void> {
  for (const e of ecritures) await e();
}

export interface ResultatOutil {
  gardes: number;
  presences: number;
  transferts: number;
  /** Créneaux issus de règles marqués d'un écart (échange de jours). */
  creneauxSignales: number;
}
const vide = (): ResultatOutil => ({ gardes: 0, presences: 0, transferts: 0, creneauxSignales: 0 });

/**
 * Copie gardes, présences et transferts de la semaine source (lundi à dimanche)
 * vers la cible. Les saisies déjà présentes sur la cible pour le même enfant et
 * le même jour sont remplacées ; un transfert identique déjà présent n'est pas dupliqué.
 * Relancer l'outil ne change donc plus rien.
 */
export async function dupliquerSemaine(
  depot: DepotFamille,
  auteurId: string,
  semaineSource: DateJour,
  semaineCible: DateJour,
): Promise<ResultatOutil> {
  const famille = await depot.lireFamille();
  verifierAdulte(famille, auteurId);
  verifierLundi(semaineSource);
  verifierLundi(semaineCible);
  if (semaineSource === semaineCible) throw new ErreurDomaine("La semaine source et la semaine cible sont identiques");

  const decalage = (versMs(semaineCible) - versMs(semaineSource)) / 86_400_000;
  const srcFin = ajouterJours(semaineSource, 6);
  const cibFin = ajouterJours(semaineCible, 6);
  const [gardes, presences, transferts] = await Promise.all([
    depot.listerGardes({ du: semaineSource, au: srcFin }),
    depot.listerPresences({ du: semaineSource, au: srcFin }),
    depot.listerTransferts({ du: semaineSource, au: srcFin }),
  ]);
  if (gardes.length + presences.length + transferts.length === 0) {
    throw new ErreurDomaine(`Rien à copier dans la semaine du ${semaineSource}`);
  }

  const gardesCible = new Map((await depot.listerGardes({ du: semaineCible, au: cibFin })).map((g) => [cle(g.enfantId, g.date), g]));
  const presCible = new Map((await depot.listerPresences({ du: semaineCible, au: cibFin })).map((p) => [cle(p.enfantId, p.date), p]));
  const trCible = await depot.listerTransferts({ du: semaineCible, au: cibFin });

  const ecritures: Ecriture[] = [];
  const res = vide();
  for (const g of gardes) {
    const n: Garde = { ...sansMarque(g), date: ajouterJours(g.date, decalage) };
    const ex = gardesCible.get(cle(n.enfantId, n.date));
    if (ex && memeContenu(ex, n)) continue;
    ecritures.push(() => depot.definirGarde(auteurId, n));
    res.gardes++;
  }
  for (const p of presences) {
    const n: Presence = { ...sansMarque(p), date: ajouterJours(p.date, decalage) };
    const ex = presCible.get(cle(n.enfantId, n.date));
    if (ex && memeContenu(ex, n)) continue;
    ecritures.push(() => depot.definirPresence(auteurId, n));
    res.presences++;
  }
  for (const t of transferts) {
    const n = { ...t, date: ajouterJours(t.date, decalage), id: undefined };
    const existe = trCible.some((c) => memeContenu({ ...c, id: undefined }, n));
    if (existe) continue;
    ecritures.push(() => depot.enregistrerTransfert(auteurId, { ...n, id: undefined }));
    res.transferts++;
  }
  await executer(ecritures);
  return res;
}

/**
 * Applique un motif cyclique : le jour `debut` prend l'entrée 0, le suivant l'entrée 1, etc.
 * Écrit garde et présence pour chaque enfant (tous par défaut) et chaque jour de la plage.
 */
export async function appliquerMotif(
  depot: DepotFamille,
  auteurId: string,
  motif: JourMotif[],
  debut: DateJour,
  fin: DateJour,
  enfantIds?: string[],
): Promise<ResultatOutil> {
  const famille = await depot.lireFamille();
  verifierAdulte(famille, auteurId);
  verifierDate(debut);
  verifierDate(fin);
  if (fin < debut) throw new ErreurDomaine("La fin précède le début");
  if (motif.length === 0) throw new ErreurDomaine("Motif vide");
  for (const j of motif) {
    verifierAdulte(famille, j.responsableId);
    if (!famille.lieux.some((l) => l.id === j.lieuId)) throw new ErreurDomaine(`Lieu inconnu : ${j.lieuId}`);
  }
  const enfants = enfantIds ?? famille.enfants.map((e) => e.id);
  verifierEnfants(famille, enfants);
  const jours = plage(debut, fin);
  if (jours.length > MAX_JOURS_MOTIF) throw new ErreurDomaine(`Plage trop longue (${MAX_JOURS_MOTIF} jours au plus)`);

  const gardes = new Map((await depot.listerGardes({ du: debut, au: fin })).map((g) => [cle(g.enfantId, g.date), g]));
  const pres = new Map((await depot.listerPresences({ du: debut, au: fin })).map((p) => [cle(p.enfantId, p.date), p]));

  const ecritures: Ecriture[] = [];
  const res = vide();
  jours.forEach((date, i) => {
    const j = motif[i % motif.length]!;
    for (const enfantId of enfants) {
      const g: Garde = { enfantId, date, responsableId: j.responsableId };
      const p: Presence = { enfantId, date, lieuId: j.lieuId };
      const eg = gardes.get(cle(enfantId, date));
      if (!eg || !memeContenu(eg, g)) {
        ecritures.push(() => depot.definirGarde(auteurId, g));
        res.gardes++;
      }
      const ep = pres.get(cle(enfantId, date));
      if (!ep || !memeContenu(ep, p)) {
        ecritures.push(() => depot.definirPresence(auteurId, p));
        res.presences++;
      }
    }
  });
  await executer(ecritures);
  return res;
}

/**
 * Permute gardes et présences de deux jours pour les enfants indiqués (tous par défaut).
 * Si un jour n'a pas d'entrée, l'entrée de l'autre jour est déplacée. Les transferts
 * ne sont pas touchés. Les créneaux issus de règles de ces enfants ces deux jours
 * restent en place et reçoivent un écart signalé.
 */
export async function echangerDeuxJours(
  depot: DepotFamille,
  auteurId: string,
  jourA: DateJour,
  jourB: DateJour,
  enfantIds?: string[],
): Promise<ResultatOutil> {
  const famille = await depot.lireFamille();
  verifierAdulte(famille, auteurId);
  verifierDate(jourA);
  verifierDate(jourB);
  if (jourA === jourB) throw new ErreurDomaine("Les deux jours sont identiques");
  const enfants = enfantIds ?? famille.enfants.map((e) => e.id);
  verifierEnfants(famille, enfants);

  const du = jourA < jourB ? jourA : jourB;
  const au = jourA < jourB ? jourB : jourA;
  const gardes = new Map((await depot.listerGardes({ du, au })).map((g) => [cle(g.enfantId, g.date), g]));
  const pres = new Map((await depot.listerPresences({ du, au })).map((p) => [cle(p.enfantId, p.date), p]));
  const creneaux = await depot.listerCreneaux({ du, au });

  const ecritures: Ecriture[] = [];
  const res = vide();
  for (const enfantId of enfants) {
    const gA = gardes.get(cle(enfantId, jourA));
    const gB = gardes.get(cle(enfantId, jourB));
    if (gA || gB) {
      if (gA) ecritures.push(() => depot.definirGarde(auteurId, { ...sansMarque(gA), date: jourB }));
      else ecritures.push(() => depot.supprimerGarde(auteurId, enfantId, jourB));
      if (gB) ecritures.push(() => depot.definirGarde(auteurId, { ...sansMarque(gB), date: jourA }));
      else ecritures.push(() => depot.supprimerGarde(auteurId, enfantId, jourA));
      res.gardes++;
    }
    const pA = pres.get(cle(enfantId, jourA));
    const pB = pres.get(cle(enfantId, jourB));
    if (pA || pB) {
      if (pA) ecritures.push(() => depot.definirPresence(auteurId, { ...sansMarque(pA), date: jourB }));
      else ecritures.push(() => depot.supprimerPresence(auteurId, enfantId, jourB));
      if (pB) ecritures.push(() => depot.definirPresence(auteurId, { ...sansMarque(pB), date: jourA }));
      else ecritures.push(() => depot.supprimerPresence(auteurId, enfantId, jourA));
      res.presences++;
    }
  }
  if (res.gardes + res.presences === 0) throw new ErreurDomaine("Rien à échanger entre ces deux jours");

  for (const c of creneaux) {
    if (!c.origine || !enfants.includes(c.enfantId) || (c.date !== jourA && c.date !== jourB)) continue;
    const autre = c.date === jourA ? jourB : jourA;
    const note = `jour échangé avec le ${autre}`;
    if (c.origine.ecart?.includes(note)) continue;
    const ecart = c.origine.ecart ? `${c.origine.ecart} ; ${note}` : note;
    ecritures.push(() => depot.enregistrerCreneau(auteurId, { ...c, origine: { ...c.origine!, ecart } }));
    res.creneauxSignales++;
  }
  await executer(ecritures);
  return res;
}
