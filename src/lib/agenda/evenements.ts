import type { Creneau, DateJour, Famille, Presence, Transfert } from "../domaine/types";
import type { EvenementSouhaite } from "./types";

export interface DonneesAgenda {
  famille: Famille;
  presences: Presence[];
  transferts: Transfert[];
  creneaux: Creneau[];
}

const jourSuivant = (d: DateJour): string => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
};

const ajouterMinutes = (date: DateJour, heure: string, minutes: number): string => {
  const t = new Date(`${date}T${heure}:00Z`);
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  return t.toISOString().slice(0, 16);
};

const DUREE_TRANSFERT_MIN = 30;

/**
 * Fonction pure : transforme présences, transferts et créneaux en événements voulus, par adulte.
 * Les deux adultes voient tout ; le titre d'un transfert dit s'il dépose ou récupère.
 * Sortie triée par clé, donc déterministe.
 */
export function evenementsSouhaites(donnees: DonneesAgenda): Record<string, EvenementSouhaite[]> {
  const { famille, presences, transferts, creneaux } = donnees;
  const prenom = (id: string) => famille.enfants.find((e) => e.id === id)?.prenom ?? id;
  const lieu = (id: string) => famille.lieux.find((l) => l.id === id)?.libelle ?? id;
  const noms = (ids: string[]) =>
    ids
      .map(prenom)
      .sort((a, b) => a.localeCompare(b, "fr"))
      .join(", ");

  const communs: EvenementSouhaite[] = [];

  // Nuits : un événement journée entière par date et par lieu, regroupant les enfants.
  const nuits = new Map<string, { date: DateJour; lieuId: string; enfantIds: string[] }>();
  for (const p of presences) {
    const k = `${p.date}|${p.lieuId}`;
    const n = nuits.get(k) ?? { date: p.date, lieuId: p.lieuId, enfantIds: [] };
    n.enfantIds.push(p.enfantId);
    nuits.set(k, n);
  }
  for (const n of nuits.values()) {
    communs.push({
      cle: `nuit:${n.date}:${n.lieuId}`,
      titre: `Nuit : ${noms(n.enfantIds)}`,
      lieu: lieu(n.lieuId),
      debut: n.date,
      fin: jourSuivant(n.date),
    });
  }

  for (const c of creneaux) {
    communs.push({
      cle: `creneau:${c.id}`,
      titre: `${c.libelle} (${prenom(c.enfantId)})`,
      debut: `${c.date}T${c.debut}`,
      fin: `${c.date}T${c.fin}`,
    });
  }

  const resultat: Record<string, EvenementSouhaite[]> = {};
  for (const adulte of famille.adultes) {
    const propres = transferts.map<EvenementSouhaite>((t) => {
      const role = t.deposeId === adulte.id ? "Dépose" : t.recupereId === adulte.id ? "Récupère" : "Transfert";
      return {
        cle: `transfert:${t.id}`,
        titre: `${role} : ${noms(t.enfantIds)}`,
        lieu: lieu(t.lieuId),
        debut: `${t.date}T${t.heure}`,
        fin: ajouterMinutes(t.date, t.heure, DUREE_TRANSFERT_MIN),
      };
    });
    resultat[adulte.id] = [...communs, ...propres].sort((a, b) => a.cle.localeCompare(b.cle));
  }
  return resultat;
}
