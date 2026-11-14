import { ErreurDomaine } from "../domaine/depot";
import {
  CONFIGURATION_CARNET_DEFAUT,
  cleCarnet,
  preparerEcriture,
  verifierAdulte,
  verifierConfigurationCarnet,
  verifierEffacement,
  type CarnetPassation,
  type CibleCarnet,
  type ConfigurationCarnet,
  type DepotCarnet,
} from "../transfert/carnet";
import { appliquerCoche, verifierIdTransfert, type DepotCoches, type EtatCoches } from "../transfert/coches";
import { idDocumentValide, type Banque, type Donnees } from "./banque";

function collection(familleId: string, nom: string) {
  if (!idDocumentValide(familleId)) throw new ErreurDomaine(`Identifiant de famille invalide : ${familleId}`);
  return `familles/${familleId}/${nom}`;
}

/** Carnets sous `familles/{familleId}/carnets/{cle}` ; lecture, contrôle et écriture dans une même transaction. */
export class DepotCarnetFirestore implements DepotCarnet {
  private readonly chemin: string;
  private readonly config: ConfigurationCarnet;
  private readonly maintenant: () => Date;

  constructor(
    private readonly banque: Banque,
    familleId: string,
    private readonly adultes: readonly string[],
    options: { configuration?: ConfigurationCarnet; maintenant?: () => Date } = {},
  ) {
    this.chemin = collection(familleId, "carnets");
    this.config = verifierConfigurationCarnet(options.configuration ?? CONFIGURATION_CARNET_DEFAUT);
    this.maintenant = options.maintenant ?? (() => new Date());
  }

  async ecrire(auteurId: string, cible: CibleCarnet, lignes: string[]) {
    verifierAdulte(this.adultes, auteurId);
    const cle = cleCarnet(cible);
    return this.banque.transaction(async (tx) => {
      const existant = (await tx.lire(this.chemin, cle)) as unknown as CarnetPassation | undefined;
      const c = preparerEcriture(this.config, this.adultes, existant, auteurId, cible, lignes, this.maintenant());
      tx.ecrire(this.chemin, cle, c as unknown as Donnees);
      return c;
    });
  }

  async lire(lecteurId: string, cible: CibleCarnet) {
    verifierAdulte(this.adultes, lecteurId);
    const cle = cleCarnet(cible);
    const d = await this.banque.transaction((tx) => tx.lire(this.chemin, cle), { lectureSeule: true });
    return d as unknown as CarnetPassation | undefined;
  }

  async effacer(auteurId: string, cible: CibleCarnet) {
    verifierAdulte(this.adultes, auteurId);
    const cle = cleCarnet(cible);
    await this.banque.transaction(async (tx) => {
      const existant = (await tx.lire(this.chemin, cle)) as unknown as CarnetPassation | undefined;
      verifierEffacement(this.adultes, existant, auteurId);
      if (existant) tx.supprimer(this.chemin, cle);
    });
  }
}

/** Coches sous `familles/{familleId}/coches/{transfertId}` : un document par transfert, `{ elements: {...} }`. */
export class DepotCochesFirestore implements DepotCoches {
  private readonly chemin: string;

  constructor(
    private readonly banque: Banque,
    familleId: string,
    private readonly adultes: readonly string[],
    private readonly maintenant: () => Date = () => new Date(),
  ) {
    this.chemin = collection(familleId, "coches");
  }

  async definir(adulteId: string, transfertId: string, elementId: string, coche: boolean) {
    verifierIdTransfert(transfertId);
    await this.banque.transaction(async (tx) => {
      const doc = await tx.lire(this.chemin, transfertId);
      const etat = ((doc?.elements as EtatCoches | undefined) ?? {}) as EtatCoches;
      const suivant = appliquerCoche(etat, this.adultes, adulteId, transfertId, elementId, coche, this.maintenant());
      if (suivant) tx.ecrire(this.chemin, transfertId, { elements: suivant });
    });
  }

  async lire(lecteurId: string, transfertId: string) {
    verifierAdulte(this.adultes, lecteurId);
    verifierIdTransfert(transfertId);
    const d = await this.banque.transaction((tx) => tx.lire(this.chemin, transfertId), { lectureSeule: true });
    return ((d?.elements as EtatCoches | undefined) ?? {}) as EtatCoches;
  }
}
