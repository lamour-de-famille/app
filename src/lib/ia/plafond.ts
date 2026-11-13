import type { SeuilsIA } from "./configuration";
import type { ClientGemini, DemandeDictee, DemandeRedaction, UsageIA } from "./types";

const FUSEAU = "Europe/Paris";

export interface Compteur {
  requetes: number;
  jetons: number;
}

/** Stockage des compteurs, clés de période comme « jour:2026-11-14 » ou « mois:2026-11 ». */
export interface StockageUsageIA {
  lire(cle: string): Promise<Compteur>;
  /** Ajoute (ou retranche, si négatif) et renvoie le nouveau total, de façon atomique. */
  ajouter(cle: string, requetes: number, jetons: number): Promise<Compteur>;
}

export class StockageUsageIAMemoire implements StockageUsageIA {
  private readonly donnees = new Map<string, Compteur>();
  async lire(cle: string) {
    return { ...(this.donnees.get(cle) ?? { requetes: 0, jetons: 0 }) };
  }
  async ajouter(cle: string, requetes: number, jetons: number) {
    const c = this.donnees.get(cle) ?? { requetes: 0, jetons: 0 };
    c.requetes += requetes;
    c.jetons += jetons;
    this.donnees.set(cle, c);
    return { ...c };
  }
}

export type PeriodePlafond = "jour" | "mois";

export class PlafondAtteint extends Error {
  constructor(public readonly periode: PeriodePlafond) {
    super(
      periode === "jour"
        ? "Limite quotidienne d'utilisation de l'assistant atteinte. Réessayez demain."
        : "Limite mensuelle d'utilisation de l'assistant atteinte. Réessayez le mois prochain.",
    );
    this.name = "PlafondAtteint";
  }
}

/** Clés de période (jour AAAA-MM-JJ et mois AAAA-MM) dans le fuseau Europe/Paris. */
export function clesPeriode(maintenant: Date): { jour: string; mois: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
  return { jour: `jour:${p}`, mois: `mois:${p.slice(0, 7)}` };
}

export interface Reservation {
  readonly cles: { jour: string; mois: string };
  readonly jetonsReserves: number;
}

export class PlafondIA {
  constructor(
    private readonly stockage: StockageUsageIA,
    private readonly seuils: SeuilsIA,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  /** Réserve une requête et une estimation de jetons ; refuse sans rien consommer si un seuil serait dépassé. */
  async reserver(): Promise<Reservation> {
    const cles = clesPeriode(this.maintenant());
    const j = this.seuils.jetonsReservesParAppel;
    const jour = await this.stockage.ajouter(cles.jour, 1, j);
    if (jour.requetes > this.seuils.maxRequetesJour || jour.jetons > this.seuils.maxJetonsJour) {
      await this.stockage.ajouter(cles.jour, -1, -j);
      throw new PlafondAtteint("jour");
    }
    const mois = await this.stockage.ajouter(cles.mois, 1, j);
    if (mois.requetes > this.seuils.maxRequetesMois || mois.jetons > this.seuils.maxJetonsMois) {
      await this.stockage.ajouter(cles.mois, -1, -j);
      await this.stockage.ajouter(cles.jour, -1, -j);
      throw new PlafondAtteint("mois");
    }
    return { cles, jetonsReserves: j };
  }

  /** Remplace l'estimation par l'usage réel. */
  async enregistrer(r: Reservation, usage: UsageIA): Promise<void> {
    const delta = usage.jetonsEntree + usage.jetonsSortie - r.jetonsReserves;
    await this.stockage.ajouter(r.cles.jour, 0, delta);
    await this.stockage.ajouter(r.cles.mois, 0, delta);
  }

  /** Appel échoué : rend la réservation (rien n'a été facturé). */
  async annuler(r: Reservation): Promise<void> {
    await this.stockage.ajouter(r.cles.jour, -1, -r.jetonsReserves);
    await this.stockage.ajouter(r.cles.mois, -1, -r.jetonsReserves);
  }
}

/** Enveloppe : réserve avant l'appel, refuse au-delà du seuil, enregistre l'usage réel après. */
export class ClientGeminiPlafonne implements ClientGemini {
  constructor(
    private readonly interne: ClientGemini,
    private readonly plafond: PlafondIA,
  ) {}

  private async proteger<T extends { usage: UsageIA }>(appel: () => Promise<T>): Promise<T> {
    const r = await this.plafond.reserver();
    let res: T;
    try {
      res = await appel();
    } catch (e) {
      await this.plafond.annuler(r);
      throw e;
    }
    await this.plafond.enregistrer(r, res.usage);
    return res;
  }

  traiterDictee(d: DemandeDictee) {
    return this.proteger(() => this.interne.traiterDictee(d));
  }

  rediger(d: DemandeRedaction) {
    return this.proteger(() => this.interne.rediger(d));
  }
}
