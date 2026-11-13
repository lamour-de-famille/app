import type { EnregistrementBrut, CritereVacances, PeriodeVacances } from "./types";

const FUSEAU = "Europe/Paris";
const FORMAT_JOUR = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" });
const JOUR_SEUL = /^\d{4}-\d{2}-\d{2}$/;
const AVEC_FUSEAU = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Convertit une date de l'API en jour civil de Paris. Retourne null si le format est invalide. */
export function jourDeParis(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const v = valeur.trim();
  if (JOUR_SEUL.test(v)) {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
  }
  if (!AVEC_FUSEAU.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : FORMAT_JOUR.format(d);
}

const texte = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x.trim() : null);
const cle = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Convertit un enregistrement ; null si invalide ou réservé aux enseignants (« - » = tous publics accepté). */
export function normaliser(brut: EnregistrementBrut): PeriodeVacances | null {
  if (!brut || typeof brut !== "object") return null;
  const nom = texte(brut.description);
  const zone = texte(brut.zones);
  const anneeScolaire = texte(brut.annee_scolaire);
  const debut = jourDeParis(brut.start_date);
  const fin = jourDeParis(brut.end_date);
  if (!nom || !zone || !anneeScolaire || !debut || !fin || fin < debut) return null;
  const population = texte(brut.population);
  if (population && cle(population) === "enseignants") return null;
  return { nom, debut, fin, zone, anneeScolaire };
}

/** Normalise, filtre, dédoublonne et trie par début. L'académie est filtrée sur le brut (non conservée dans le type). */
export function periodesVacances(bruts: EnregistrementBrut[], critere: CritereVacances = {}): PeriodeVacances[] {
  const vus = new Map<string, PeriodeVacances>();
  for (const brut of bruts) {
    const p = normaliser(brut);
    if (!p) continue;
    if (critere.zone && cle(p.zone) !== cle(critere.zone)) continue;
    if (critere.anneeScolaire && p.anneeScolaire !== critere.anneeScolaire) continue;
    if (critere.academie) {
      const loc = texte(brut.location);
      if (!loc || cle(loc) !== cle(critere.academie)) continue;
    }
    vus.set(`${p.zone}|${p.anneeScolaire}|${cle(p.nom)}|${p.debut}|${p.fin}`, p);
  }
  return [...vus.values()].sort((a, b) => a.debut.localeCompare(b.debut) || a.fin.localeCompare(b.fin) || a.nom.localeCompare(b.nom));
}
