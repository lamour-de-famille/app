import { ErreurDomaine } from "../domaine/depot";
import { idDocumentValide } from "../firestore/banque";
import { verifierAdulte } from "./carnet";

export interface Coche {
  parId: string;
  /** Horodatage ISO 8601 du premier cochage. */
  le: string;
}

/** Éléments cochés d'un transfert, par id d'élément. */
export type EtatCoches = Record<string, Coche>;

/**
 * Avancement partagé de la liste d'un transfert : les deux adultes voient la même chose.
 * `definir` est idempotent : cocher deux fois garde le premier cochage ; décocher un élément non coché ne fait rien.
 */
export interface DepotCoches {
  definir(adulteId: string, transfertId: string, elementId: string, coche: boolean): Promise<void>;
  lire(lecteurId: string, transfertId: string): Promise<EtatCoches>;
}

export function verifierIdTransfert(transfertId: string) {
  if (!idDocumentValide(transfertId)) throw new ErreurDomaine("Identifiant de transfert invalide");
}

/** Logique commune : nouvel état après `definir`, ou `undefined` si rien ne change. */
export function appliquerCoche(
  etat: EtatCoches,
  adultes: readonly string[],
  adulteId: string,
  transfertId: string,
  elementId: string,
  coche: boolean,
  maintenant: Date,
): EtatCoches | undefined {
  verifierAdulte(adultes, adulteId);
  verifierIdTransfert(transfertId);
  if (!idDocumentValide(elementId) || elementId.length > 200) throw new ErreurDomaine("Identifiant d'élément invalide");
  if (coche === Object.hasOwn(etat, elementId)) return undefined;
  const suivant = { ...etat };
  if (coche) suivant[elementId] = { parId: adulteId, le: maintenant.toISOString() };
  else delete suivant[elementId];
  return suivant;
}

export class DepotCochesMemoire implements DepotCoches {
  private readonly etats = new Map<string, EtatCoches>();

  constructor(
    private readonly adultes: readonly string[],
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  async definir(adulteId: string, transfertId: string, elementId: string, coche: boolean) {
    const suivant = appliquerCoche(this.etats.get(transfertId) ?? {}, this.adultes, adulteId, transfertId, elementId, coche, this.maintenant());
    if (suivant) this.etats.set(transfertId, suivant);
  }

  async lire(lecteurId: string, transfertId: string) {
    verifierAdulte(this.adultes, lecteurId);
    verifierIdTransfert(transfertId);
    return structuredClone(this.etats.get(transfertId) ?? {});
  }
}
