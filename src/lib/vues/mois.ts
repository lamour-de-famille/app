import type { DateJour } from "@/lib/domaine/types";

export interface CelluleMois {
  date: DateJour;
  jour: number;
  dansMois: boolean;
}

const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date): DateJour => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Semaines (lundi en premier) couvrant le mois ; les jours voisins sont marqués `dansMois: false`. */
export function grilleMois(annee: number, mois: number): CelluleMois[][] {
  if (!Number.isInteger(mois) || mois < 1 || mois > 12) throw new Error(`Mois invalide : ${mois}`);
  const premier = new Date(Date.UTC(annee, mois - 1, 1));
  const decalage = (premier.getUTCDay() + 6) % 7;
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const nbSemaines = Math.ceil((decalage + nbJours) / 7);
  const semaines: CelluleMois[][] = [];
  for (let s = 0; s < nbSemaines; s++) {
    const semaine: CelluleMois[] = [];
    for (let j = 0; j < 7; j++) {
      const d = new Date(Date.UTC(annee, mois - 1, 1 - decalage + s * 7 + j));
      semaine.push({ date: iso(d), jour: d.getUTCDate(), dansMois: d.getUTCMonth() === mois - 1 });
    }
    semaines.push(semaine);
  }
  return semaines;
}

export function moisAdjacent(annee: number, mois: number, sens: 1 | -1): { annee: number; mois: number } {
  const d = new Date(Date.UTC(annee, mois - 1 + sens, 1));
  return { annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1 };
}

/** Lit « AAAA-MM » ; retombe sur `repli` (lui-même « AAAA-MM ») si la valeur est absente ou invalide. */
export function analyserMois(valeur: string | undefined, repli: string): { annee: number; mois: number } {
  const lire = (v: string | undefined) => {
    const m = v ? /^(\d{4})-(\d{2})$/.exec(v) : null;
    const mois = m ? Number(m[2]) : 0;
    return m && mois >= 1 && mois <= 12 ? { annee: Number(m[1]), mois } : null;
  };
  return lire(valeur) ?? lire(repli) ?? { annee: 1970, mois: 1 };
}

export const MAX_JOURS_DEMANDE = 31;

/** Tous les jours de `du` à `au`, bornes incluses. */
export function joursEntre(du: DateJour, au: DateJour): DateJour[] {
  const a = RE_DATE.exec(du);
  const b = RE_DATE.exec(au);
  if (!a || !b) throw new Error("Dates invalides");
  const debut = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const fin = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  if (Number.isNaN(debut) || Number.isNaN(fin) || iso(new Date(debut)) !== du || iso(new Date(fin)) !== au) {
    throw new Error("Dates invalides");
  }
  if (fin < debut) throw new Error("La fin précède le début");
  const n = Math.round((fin - debut) / 86_400_000) + 1;
  if (n > MAX_JOURS_DEMANDE) throw new Error(`Plus de ${MAX_JOURS_DEMANDE} jours`);
  return Array.from({ length: n }, (_, i) => iso(new Date(debut + i * 86_400_000)));
}
