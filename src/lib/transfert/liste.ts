import { ErreurDomaine } from "../domaine/depot";
import type { Creneau, Famille, Transfert } from "../domaine/types";
import { ajouterJours, sansAccent } from "../regles/dates";
import type { EtatCoches } from "./coches";

/** Un objet à emporter : `code` est stable (il sert à l'identifiant de l'élément), `libelle` s'affiche. */
export interface ModeleElement {
  code: string;
  libelle: string;
}

/** Quand chercher le créneau qui déclenche l'ajout : le jour du transfert, le lendemain, ou les deux. */
export type Moment = "jour" | "lendemain" | "les-deux";

export interface CorrespondanceCreneau {
  /** Mot cherché dans le libellé du créneau, sans tenir compte de la casse ni des accents. */
  motif: string;
  moment: Moment;
  elements: ModeleElement[];
}

/** Toute la partie « données » de la liste : sérialisable, à stocker et à faire modifier par les adultes. */
export interface ConfigurationListe {
  /** Affaires de base de chaque enfant. */
  baseParEnfant: Record<string, ModeleElement[]>;
  /** Affaires de base communes à tous les enfants du transfert. */
  baseCommune: ModeleElement[];
  correspondances: CorrespondanceCreneau[];
}

export interface ElementListe {
  /** `enfantId|code` : stable d'un affichage à l'autre, sert de clé de coche. */
  id: string;
  enfantId: string;
  enfant: string;
  code: string;
  libelle: string;
  origine: "base" | "creneau";
  creneauId?: string;
}

const MOMENTS: Moment[] = ["jour", "lendemain", "les-deux"];
const CODE = /^[a-z0-9-]{1,60}$/;

function verifierElements(elements: unknown, contexte: string): asserts elements is ModeleElement[] {
  if (!Array.isArray(elements)) throw new ErreurDomaine(`${contexte} : liste attendue`);
  for (const e of elements as Partial<ModeleElement>[]) {
    if (typeof e?.code !== "string" || !CODE.test(e.code)) throw new ErreurDomaine(`${contexte} : code invalide`);
    if (typeof e.libelle !== "string" || e.libelle.trim() === "") throw new ErreurDomaine(`${contexte} : libellé vide`);
  }
}

/** Valide une configuration lue de la base (ou saisie) ; lève `ErreurDomaine`. */
export function validerConfigurationListe(c: ConfigurationListe): ConfigurationListe {
  verifierElements(c.baseCommune, "baseCommune");
  for (const [enfant, els] of Object.entries(c.baseParEnfant ?? {})) verifierElements(els, `baseParEnfant.${enfant}`);
  if (!Array.isArray(c.correspondances)) throw new ErreurDomaine("correspondances : liste attendue");
  for (const m of c.correspondances) {
    if (typeof m.motif !== "string" || sansAccent(m.motif).trim() === "") throw new ErreurDomaine("correspondance : motif vide");
    if (!MOMENTS.includes(m.moment)) throw new ErreurDomaine("correspondance : moment invalide");
    verifierElements(m.elements, `correspondance ${m.motif}`);
  }
  return c;
}

/**
 * Liste d'affaires d'un transfert, par enfant concerné : la base (commune puis propre à l'enfant), enrichie
 * par les créneaux de l'enfant le jour du transfert ou le lendemain selon la table de correspondance.
 * Pure et déterministe ; un même code n'apparaît qu'une fois par enfant (la base l'emporte).
 * Les enfants dans l'ordre du transfert, les éléments dans l'ordre de la configuration.
 */
export function listeDuTransfert(
  famille: Famille,
  transfert: Transfert,
  creneaux: Creneau[],
  configuration: ConfigurationListe,
): ElementListe[] {
  const config = validerConfigurationListe(configuration);
  const lendemain = ajouterJours(transfert.date, 1);
  const resultat: ElementListe[] = [];

  for (const enfantId of new Set(transfert.enfantIds)) {
    const enfant = famille.enfants.find((e) => e.id === enfantId);
    if (!enfant) continue;
    const vus = new Set<string>();
    const ajouter = (m: ModeleElement, origine: ElementListe["origine"], creneauId?: string) => {
      if (vus.has(m.code)) return;
      vus.add(m.code);
      resultat.push({
        id: `${enfantId}|${m.code}`,
        enfantId,
        enfant: enfant.prenom,
        code: m.code,
        libelle: m.libelle.trim(),
        origine,
        ...(creneauId ? { creneauId } : {}),
      });
    };

    for (const m of config.baseCommune) ajouter(m, "base");
    for (const m of config.baseParEnfant[enfantId] ?? []) ajouter(m, "base");

    const siens = creneaux
      .filter((c) => c.enfantId === enfantId)
      .sort((a, b) => (a.date + a.debut + a.id < b.date + b.debut + b.id ? -1 : 1));
    for (const regle of config.correspondances) {
      const motif = sansAccent(regle.motif).trim();
      for (const c of siens) {
        const dansLaFenetre =
          (c.date === transfert.date && regle.moment !== "lendemain") || (c.date === lendemain && regle.moment !== "jour");
        if (dansLaFenetre && sansAccent(c.libelle).includes(motif)) for (const m of regle.elements) ajouter(m, "creneau", c.id);
      }
    }
  }
  return resultat;
}

export interface Avancement {
  faits: number;
  total: number;
  /** Éléments non cochés, dans l'ordre de la liste. */
  restants: ElementListe[];
}

/** Avancement de la liste d'après les coches partagées (les coches d'éléments disparus sont ignorées). */
export function avancement(liste: ElementListe[], coches: EtatCoches): Avancement {
  const restants = liste.filter((e) => !Object.hasOwn(coches, e.id));
  return { faits: liste.length - restants.length, total: liste.length, restants };
}
