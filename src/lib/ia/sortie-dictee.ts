import type { Famille } from "../domaine/types";
import type { NoteDictee, Recurrence, RendezVousDictee, SortieDictee, TacheDictee } from "./types";

export class SortieDicteeInvalide extends Error {
  constructor(public readonly problemes: string[]) {
    super(`Sortie de dictée invalide : ${problemes.join(" ; ")}`);
    this.name = "SortieDicteeInvalide";
  }
}

const RECURRENCES: readonly Recurrence[] = ["quotidienne", "hebdomadaire", "mensuelle", "annuelle"];
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_DATE_HEURE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function dateValide(s: string): boolean {
  if (!RE_DATE.test(s)) return false;
  const [a = 0, m = 0, j = 0] = s.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

function dateHeureValide(s: string): boolean {
  if (!RE_DATE_HEURE.test(s)) return false;
  const h = Number(s.slice(11, 13));
  const mi = Number(s.slice(14, 16));
  return dateValide(s.slice(0, 10)) && h < 24 && mi < 60;
}

/** Retire d'éventuelles clôtures markdown (```json ... ```) autour d'une réponse JSON. */
export function extraireJson(brut: string): string {
  const t = brut.trim();
  const m = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?\s*```$/.exec(t);
  return (m?.[1] ?? t).trim();
}

type Obj = Record<string, unknown>;

function estObjet(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

class Verif {
  problemes: string[] = [];
  err(chemin: string, msg: string) {
    this.problemes.push(`${chemin} ${msg}`);
  }
  objet(v: unknown, chemin: string, permis: string[]): Obj | null {
    if (!estObjet(v)) {
      this.err(chemin, "doit être un objet");
      return null;
    }
    for (const k of Object.keys(v)) if (!permis.includes(k)) this.err(`${chemin}.${k}`, "champ inconnu");
    return v;
  }
  texte(o: Obj, k: string, chemin: string, requis: boolean): string | undefined {
    const v = o[k];
    if (v === undefined) {
      if (requis) this.err(`${chemin}.${k}`, "est obligatoire");
      return undefined;
    }
    if (typeof v !== "string" || v.trim() === "") {
      this.err(`${chemin}.${k}`, "doit être un texte non vide");
      return undefined;
    }
    return v;
  }
  liste(o: Obj, k: string): unknown[] {
    const v = o[k];
    if (!Array.isArray(v)) {
      this.err(k, "doit être une liste");
      return [];
    }
    return v;
  }
}

/** Valide strictement une sortie de dictée (objet déjà analysé). Lève SortieDicteeInvalide. */
export function validerSortieDictee(valeur: unknown): SortieDictee {
  const v = new Verif();
  const racine = v.objet(valeur, "sortie", ["transcription", "taches", "rendezVous", "notes"]);
  if (!racine) throw new SortieDicteeInvalide(v.problemes);

  const transcription = typeof racine.transcription === "string" ? racine.transcription : undefined;
  if (transcription === undefined) v.err("transcription", "doit être un texte");

  const taches: TacheDictee[] = [];
  v.liste(racine, "taches").forEach((e, i) => {
    const c = `taches[${i}]`;
    const o = v.objet(e, c, ["titre", "assigneId", "echeance", "enfantId", "recurrence"]);
    if (!o) return;
    const titre = v.texte(o, "titre", c, true);
    const assigneId = v.texte(o, "assigneId", c, false);
    const enfantId = v.texte(o, "enfantId", c, false);
    const echeance = v.texte(o, "echeance", c, false);
    if (echeance !== undefined && !dateValide(echeance)) v.err(`${c}.echeance`, "doit être une date AAAA-MM-JJ valide");
    let recurrence: Recurrence | undefined;
    if (o.recurrence !== undefined) {
      if (RECURRENCES.includes(o.recurrence as Recurrence)) recurrence = o.recurrence as Recurrence;
      else v.err(`${c}.recurrence`, `doit valoir l'une de : ${RECURRENCES.join(", ")}`);
    }
    if (titre !== undefined) {
      taches.push({ titre, ...(assigneId && { assigneId }), ...(echeance && { echeance }), ...(enfantId && { enfantId }), ...(recurrence && { recurrence }) });
    }
  });

  const rendezVous: RendezVousDictee[] = [];
  v.liste(racine, "rendezVous").forEach((e, i) => {
    const c = `rendezVous[${i}]`;
    const o = v.objet(e, c, ["titre", "debut", "fin", "lieu", "enfantIds"]);
    if (!o) return;
    const titre = v.texte(o, "titre", c, true);
    const debut = v.texte(o, "debut", c, true);
    const fin = v.texte(o, "fin", c, false);
    const lieu = v.texte(o, "lieu", c, false);
    if (debut !== undefined && !dateHeureValide(debut)) v.err(`${c}.debut`, "doit être AAAA-MM-JJTHH:MM valide");
    if (fin !== undefined && !dateHeureValide(fin)) v.err(`${c}.fin`, "doit être AAAA-MM-JJTHH:MM valide");
    if (debut && fin && dateHeureValide(debut) && dateHeureValide(fin) && fin < debut) v.err(`${c}.fin`, "ne peut précéder le début");
    let enfantIds: string[] | undefined;
    if (o.enfantIds !== undefined) {
      if (Array.isArray(o.enfantIds) && o.enfantIds.every((x) => typeof x === "string" && x !== "")) enfantIds = o.enfantIds as string[];
      else v.err(`${c}.enfantIds`, "doit être une liste de textes non vides");
    }
    if (titre !== undefined && debut !== undefined) {
      rendezVous.push({ titre, debut, ...(fin && { fin }), ...(lieu && { lieu }), ...(enfantIds && { enfantIds }) });
    }
  });

  const notes: NoteDictee[] = [];
  v.liste(racine, "notes").forEach((e, i) => {
    const c = `notes[${i}]`;
    const o = v.objet(e, c, ["texte", "enfantId"]);
    if (!o) return;
    const texte = v.texte(o, "texte", c, true);
    const enfantId = v.texte(o, "enfantId", c, false);
    if (texte !== undefined) notes.push({ texte, ...(enfantId && { enfantId }) });
  });

  if (v.problemes.length > 0 || transcription === undefined) throw new SortieDicteeInvalide(v.problemes);
  return { transcription, taches, rendezVous, notes };
}

/** Analyse une réponse brute (JSON, éventuellement entouré de clôtures markdown) et la valide. */
export function analyserSortieDictee(brut: string): SortieDictee {
  let valeur: unknown;
  try {
    valeur = JSON.parse(extraireJson(brut));
  } catch {
    throw new SortieDicteeInvalide(["la réponse n'est pas du JSON valide"]);
  }
  return validerSortieDictee(valeur);
}

/** Vérification croisée : tous les identifiants cités existent dans la famille. */
export function verifierIdentifiants(sortie: SortieDictee, famille: Famille): void {
  const adultes = new Set(famille.adultes.map((a) => a.id));
  const enfants = new Set(famille.enfants.map((e) => e.id));
  const p: string[] = [];
  sortie.taches.forEach((t, i) => {
    if (t.assigneId && !adultes.has(t.assigneId)) p.push(`taches[${i}].assigneId « ${t.assigneId} » n'est pas un adulte de la famille`);
    if (t.enfantId && !enfants.has(t.enfantId)) p.push(`taches[${i}].enfantId « ${t.enfantId} » n'est pas un enfant de la famille`);
  });
  sortie.rendezVous.forEach((r, i) =>
    r.enfantIds?.forEach((id) => {
      if (!enfants.has(id)) p.push(`rendezVous[${i}].enfantIds « ${id} » n'est pas un enfant de la famille`);
    }),
  );
  sortie.notes.forEach((n, i) => {
    if (n.enfantId && !enfants.has(n.enfantId)) p.push(`notes[${i}].enfantId « ${n.enfantId} » n'est pas un enfant de la famille`);
  });
  if (p.length > 0) throw new SortieDicteeInvalide(p);
}

/** Analyse, valide et vérifie : seule sortie utilisable pour écrire. Lève SortieDicteeInvalide sinon. */
export function sortieDicteeSure(brut: string, famille: Famille): SortieDictee {
  const s = analyserSortieDictee(brut);
  verifierIdentifiants(s, famille);
  return s;
}
