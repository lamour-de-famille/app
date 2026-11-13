/**
 * Application des règles dans un DepotFamille : gardes, présences, transferts et créneaux marqués.
 * Idempotent : les ids sont déterministes et les écritures identiques sont sans effet.
 */
import type { DepotFamille } from "../domaine/depot";
import { ErreurDomaine } from "../domaine/depot";
import type { Creneau, DateJour, Famille, Heure, Transfert } from "../domaine/types";
import { bornesMois, plage } from "./dates";
import { genererCreneaux, genererSegments } from "./moteur";
import type { PeriodeVacances } from "./types";

export interface ResultatApplication {
  creneauxEcrits: number;
  /** Créneaux déplacés à la main (écart signalé), non écrasés. */
  creneauxPreserves: number;
  creneauxSupprimes: number;
  transfertsEcrits: number;
  transfertsSupprimes: number;
}

const PREFIXE_TRANSFERT = "rg:tr:";

function domicileDe(famille: Famille, adulteId: string): string {
  const type = famille.adultes[0].id === adulteId ? "domicile_a" : "domicile_b";
  const lieu = famille.lieux.find((l) => l.type === type);
  if (!lieu) throw new ErreurDomaine(`Aucun lieu ${type}`);
  return lieu.id;
}

export async function appliquerRegles(
  depot: DepotFamille,
  auteurId: string,
  mois: string,
  periodes: PeriodeVacances[],
): Promise<ResultatApplication> {
  const { du, au } = bornesMois(mois);
  const dansMois = (d: DateJour) => d >= du && d <= au;
  const famille = await depot.lireFamille();
  const regles = await depot.listerRegles();
  const segments = genererSegments(regles, periodes, mois);
  const autre = (id: string) => famille.adultes.find((a) => a.id !== id)!.id;

  // Tout est calculé avant la première écriture.
  const gardes = new Map<string, { enfantId: string; date: DateJour; responsableId: string }>();
  const presences = new Map<string, { enfantId: string; date: DateJour; lieuId: string }>();
  const transferts = new Map<string, Transfert>();
  for (const s of segments) {
    for (const enfantId of s.enfantIds) {
      for (const date of plage(s.debut.date, s.fin.date).filter(dansMois)) {
        gardes.set(`${enfantId}|${date}`, { enfantId, date, responsableId: s.responsableId });
      }
      for (const date of s.nuits.filter(dansMois)) {
        presences.set(`${enfantId}|${date}`, { enfantId, date, lieuId: domicileDe(famille, s.responsableId) });
      }
    }
    const remises: Array<{ date: DateJour; heure: Heure; depose: string; recupere: string }> = [];
    if (s.prise) remises.push({ ...s.debut, depose: autre(s.responsableId), recupere: s.responsableId });
    if (s.remise) remises.push({ ...s.fin, depose: s.responsableId, recupere: autre(s.responsableId) });
    for (const m of remises.filter((x) => dansMois(x.date))) {
      const lieuId = s.lieuTransfertId ?? domicileDe(famille, m.recupere);
      const id = `${PREFIXE_TRANSFERT}${m.date}:${m.heure.replace(":", "")}:${m.depose}:${m.recupere}:${lieuId}`;
      const existant = transferts.get(id);
      const enfantIds = [...new Set([...(existant?.enfantIds ?? []), ...s.enfantIds])].sort();
      transferts.set(id, { id, date: m.date, heure: m.heure, lieuId, deposeId: m.depose, recupereId: m.recupere, enfantIds });
    }
  }
  const voulus = genererCreneaux(regles, periodes, mois);
  const idsVoulus = new Set(voulus.map((c) => c.id));
  const creneauxExistants = new Map((await depot.listerCreneaux()).map((c) => [c.id, c]));
  const transfertsExistants = await depot.listerTransferts();

  const r: ResultatApplication = {
    creneauxEcrits: 0,
    creneauxPreserves: 0,
    creneauxSupprimes: 0,
    transfertsEcrits: 0,
    transfertsSupprimes: 0,
  };

  for (const c of voulus) {
    const ex = creneauxExistants.get(c.id);
    if (ex?.origine?.ecart !== undefined) {
      r.creneauxPreserves++;
      continue;
    }
    if (ex && JSON.stringify(ex) === JSON.stringify(c)) continue;
    await depot.enregistrerCreneau(auteurId, c);
    r.creneauxEcrits++;
  }
  for (const ex of creneauxExistants.values()) {
    const genere = ex.origine?.type === "regle" && ex.id.startsWith("rg:");
    if (genere && ex.origine?.ecart === undefined && dansMois(ex.date) && !idsVoulus.has(ex.id)) {
      await depot.supprimerCreneau(auteurId, ex.id);
      r.creneauxSupprimes++;
    }
  }

  for (const g of [...gardes.values()].sort((a, b) => a.date.localeCompare(b.date) || a.enfantId.localeCompare(b.enfantId))) {
    await depot.definirGarde(auteurId, g);
  }
  for (const p of [...presences.values()].sort((a, b) => a.date.localeCompare(b.date) || a.enfantId.localeCompare(b.enfantId))) {
    await depot.definirPresence(auteurId, p);
  }

  const existantsParId = new Map(transfertsExistants.map((t) => [t.id, t]));
  for (const t of [...transferts.values()].sort((a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure))) {
    const ex = existantsParId.get(t.id);
    if (ex && JSON.stringify(ex) === JSON.stringify(t)) continue;
    await depot.enregistrerTransfert(auteurId, t);
    r.transfertsEcrits++;
  }
  for (const ex of transfertsExistants) {
    if (ex.id.startsWith(PREFIXE_TRANSFERT) && dansMois(ex.date) && !transferts.has(ex.id)) {
      await depot.supprimerTransfert(auteurId, ex.id);
      r.transfertsSupprimes++;
    }
  }
  return r;
}

export interface Deplacement {
  date?: DateJour;
  debut?: Heure;
  fin?: Heure;
}

const libelleHoraire = (c: Pick<Creneau, "date" | "debut" | "fin">) => `${c.date} ${c.debut}-${c.fin}`;

/**
 * Déplace un créneau. S'il vient d'une règle, il garde sa marque et reçoit un `ecart`
 * (ancien et nouvel horaire) : l'application des règles ne l'écrase plus.
 */
export async function deplacerCreneau(
  depot: DepotFamille,
  auteurId: string,
  creneauId: string,
  deplacement: Deplacement,
): Promise<Creneau> {
  const actuel = (await depot.listerCreneaux()).find((c) => c.id === creneauId);
  if (!actuel) throw new ErreurDomaine(`Créneau inconnu : ${creneauId}`);
  const nouveau: Creneau = { ...actuel };
  if (deplacement.date !== undefined) nouveau.date = deplacement.date;
  if (deplacement.debut !== undefined) nouveau.debut = deplacement.debut;
  if (deplacement.fin !== undefined) nouveau.fin = deplacement.fin;
  if (actuel.origine?.type === "regle") {
    const note = `déplacé de ${libelleHoraire(actuel)} à ${libelleHoraire(nouveau)}`;
    nouveau.origine = {
      ...actuel.origine,
      ecart: actuel.origine.ecart === undefined ? note : `${actuel.origine.ecart} ; ${note}`,
    };
  }
  return depot.enregistrerCreneau(auteurId, nouveau);
}
