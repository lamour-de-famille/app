import { ErreurDomaine, type DepotFamille } from "../domaine/depot";
import type { DateJour } from "../domaine/types";
import { idDocumentValide } from "../firestore/banque";

/** Valeurs de réglage du carnet : jamais codées dans la logique, fixées à la construction du dépôt. */
export interface ConfigurationCarnet {
  maxLignes: number;
  longueurMaxLigne: number;
}

export const CONFIGURATION_CARNET_DEFAUT: ConfigurationCarnet = { maxLignes: 3, longueurMaxLigne: 80 };

export function verifierConfigurationCarnet(c: ConfigurationCarnet): ConfigurationCarnet {
  if (!Number.isInteger(c.maxLignes) || c.maxLignes < 1 || !Number.isInteger(c.longueurMaxLigne) || c.longueurMaxLigne < 1) {
    throw new ErreurDomaine("Configuration du carnet invalide");
  }
  return { ...c };
}

/** Un carnet se rattache à un transfert ou, à défaut, à une date. */
export type CibleCarnet = { transfertId: string } | { date: DateJour };

export interface CarnetPassation {
  cle: string;
  cible: CibleCarnet;
  /** L'adulte qui remet les enfants : seul à pouvoir modifier ou effacer. */
  auteurId: string;
  lignes: string[];
  /** Horodatage ISO 8601. */
  modifieLe: string;
}

/**
 * Quelques lignes laissées par l'adulte qui remet les enfants, lisibles par les deux adultes.
 * Toute opération est refusée à une personne hors de la famille.
 */
export interface DepotCarnet {
  /** Crée ou remplace le carnet ; refusé si un autre adulte en est l'auteur. */
  ecrire(auteurId: string, cible: CibleCarnet, lignes: string[]): Promise<CarnetPassation>;
  lire(lecteurId: string, cible: CibleCarnet): Promise<CarnetPassation | undefined>;
  /** Réservé à l'auteur ; sans effet si le carnet n'existe pas. */
  effacer(auteurId: string, cible: CibleCarnet): Promise<void>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateReelle = (d: string) => DATE.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** Clé de stockage, valide comme identifiant de document. */
export function cleCarnet(cible: CibleCarnet): string {
  if ("transfertId" in cible) {
    if (!idDocumentValide(cible.transfertId)) throw new ErreurDomaine("Identifiant de transfert invalide");
    return `transfert-${cible.transfertId}`;
  }
  if (!dateReelle(cible.date)) throw new ErreurDomaine(`Date invalide : ${cible.date}`);
  return `date-${cible.date}`;
}

/** Lignes nettoyées (espaces de bord retirés) ; refuse tout dépassement plutôt que de tronquer en silence. */
export function validerLignes(config: ConfigurationCarnet, lignes: unknown): string[] {
  if (!Array.isArray(lignes) || lignes.length === 0) throw new ErreurDomaine("Le carnet doit contenir au moins une ligne");
  if (lignes.length > config.maxLignes) throw new ErreurDomaine(`Au plus ${config.maxLignes} lignes`);
  return lignes.map((l) => {
    if (typeof l !== "string") throw new ErreurDomaine("Une ligne doit être un texte");
    const t = l.trim();
    if (t === "") throw new ErreurDomaine("Une ligne ne peut pas être vide");
    if (/[\r\n]/.test(t)) throw new ErreurDomaine("Une ligne tient sur une seule ligne");
    if ([...t].length > config.longueurMaxLigne) throw new ErreurDomaine(`Une ligne fait au plus ${config.longueurMaxLigne} caractères`);
    return t;
  });
}

export function verifierAdulte(adultes: readonly string[], id: string) {
  if (!adultes.includes(id)) throw new ErreurDomaine(`Adulte inconnu : ${id}`);
}

/** Logique commune aux deux dépôts : prépare le carnet à écrire, ou refuse. */
export function preparerEcriture(
  config: ConfigurationCarnet,
  adultes: readonly string[],
  existant: CarnetPassation | undefined,
  auteurId: string,
  cible: CibleCarnet,
  lignes: string[],
  maintenant: Date,
): CarnetPassation {
  verifierAdulte(adultes, auteurId);
  const cle = cleCarnet(cible);
  const propres = validerLignes(config, lignes);
  if (existant && existant.auteurId !== auteurId) throw new ErreurDomaine("Seul l'auteur du carnet peut le modifier");
  return { cle, cible: { ...cible }, auteurId, lignes: propres, modifieLe: maintenant.toISOString() };
}

export function verifierEffacement(adultes: readonly string[], existant: CarnetPassation | undefined, auteurId: string) {
  verifierAdulte(adultes, auteurId);
  if (existant && existant.auteurId !== auteurId) throw new ErreurDomaine("Seul l'auteur du carnet peut l'effacer");
}

export class DepotCarnetMemoire implements DepotCarnet {
  private readonly carnets = new Map<string, CarnetPassation>();
  private readonly config: ConfigurationCarnet;
  private readonly maintenant: () => Date;

  constructor(
    private readonly adultes: readonly string[],
    options: { configuration?: ConfigurationCarnet; maintenant?: () => Date } = {},
  ) {
    this.config = verifierConfigurationCarnet(options.configuration ?? CONFIGURATION_CARNET_DEFAUT);
    this.maintenant = options.maintenant ?? (() => new Date());
  }

  async ecrire(auteurId: string, cible: CibleCarnet, lignes: string[]) {
    verifierAdulte(this.adultes, auteurId);
    const existant = this.carnets.get(cleCarnet(cible));
    const c = preparerEcriture(this.config, this.adultes, existant, auteurId, cible, lignes, this.maintenant());
    this.carnets.set(c.cle, c);
    return structuredClone(c);
  }

  async lire(lecteurId: string, cible: CibleCarnet) {
    verifierAdulte(this.adultes, lecteurId);
    const c = this.carnets.get(cleCarnet(cible));
    return c && structuredClone(c);
  }

  async effacer(auteurId: string, cible: CibleCarnet) {
    verifierAdulte(this.adultes, auteurId);
    const cle = cleCarnet(cible);
    verifierEffacement(this.adultes, this.carnets.get(cle), auteurId);
    this.carnets.delete(cle);
  }
}

/** Écriture d'un carnet de transfert : seul l'adulte qui remet les enfants (`deposeId`) peut l'écrire. */
export async function ecrireCarnetDuTransfert(
  famille: Pick<DepotFamille, "listerTransferts">,
  carnet: DepotCarnet,
  auteurId: string,
  transfertId: string,
  lignes: string[],
) {
  const t = (await famille.listerTransferts()).find((x) => x.id === transfertId);
  if (!t) throw new ErreurDomaine(`Transfert introuvable : ${transfertId}`);
  if (t.deposeId !== auteurId) throw new ErreurDomaine("Seul l'adulte qui remet les enfants peut écrire le carnet du transfert");
  return carnet.ecrire(auteurId, { transfertId }, lignes);
}

/** Lecture du carnet d'un transfert existant par l'un des deux adultes. */
export async function lireCarnetDuTransfert(
  famille: Pick<DepotFamille, "listerTransferts">,
  carnet: DepotCarnet,
  lecteurId: string,
  transfertId: string,
) {
  if (!(await famille.listerTransferts()).some((x) => x.id === transfertId)) {
    throw new ErreurDomaine(`Transfert introuvable : ${transfertId}`);
  }
  return carnet.lire(lecteurId, { transfertId });
}
