import type {
  AbonnementPush,
  ElementRegroupe,
  FileRegroupement,
  StockageAbonnements,
  StockageCompteurNotifications,
} from "./types";

export class StockageAbonnementsMemoire implements StockageAbonnements {
  private readonly parAdulte = new Map<string, Map<string, AbonnementPush>>();

  async ajouter(adulteId: string, abonnement: AbonnementPush) {
    for (const [id, appareils] of this.parAdulte) {
      if (id !== adulteId) appareils.delete(abonnement.endpoint);
    }
    const appareils = this.parAdulte.get(adulteId) ?? new Map<string, AbonnementPush>();
    appareils.set(abonnement.endpoint, structuredClone(abonnement));
    this.parAdulte.set(adulteId, appareils);
  }
  async lister(adulteId: string) {
    return [...(this.parAdulte.get(adulteId)?.values() ?? [])].map((a) => structuredClone(a));
  }
  async retirer(adulteId: string, endpoint: string) {
    this.parAdulte.get(adulteId)?.delete(endpoint);
  }
}

export class FileRegroupementMemoire implements FileRegroupement {
  private elements: ElementRegroupe[] = [];
  async ajouter(element: ElementRegroupe) {
    this.elements.push({ ...element });
  }
  async lister(destinataireId: string) {
    return this.elements.filter((e) => e.destinataireId === destinataireId).map((e) => ({ ...e }));
  }
  async vider(destinataireId: string) {
    const pris = this.elements.filter((e) => e.destinataireId === destinataireId);
    this.elements = this.elements.filter((e) => e.destinataireId !== destinataireId);
    return pris;
  }
}

/** Aucune attente entre lecture et écriture : la réservation est atomique. */
export class StockageCompteurMemoire implements StockageCompteurNotifications {
  private readonly donnees = new Map<string, number>();
  async reserver(cle: string, max: number) {
    const n = this.donnees.get(cle) ?? 0;
    if (n >= max) return false;
    this.donnees.set(cle, n + 1);
    return true;
  }
  async liberer(cle: string) {
    const n = this.donnees.get(cle) ?? 0;
    if (n > 0) this.donnees.set(cle, n - 1);
  }
  async lire(cle: string) {
    return this.donnees.get(cle) ?? 0;
  }
}
