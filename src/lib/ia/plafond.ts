import type { SeuilsIA } from "./configuration";
import { SortieDicteeInvalide } from "./sortie-dictee";
import type { ClientGemini, DemandeDictee, DemandeRedaction, UsageIA } from "./types";

const FUSEAU = "Europe/Paris";

export interface Compteur {
  requetes: number;
  jetonsEntree: number;
  /** Jetons de sortie, réflexion comprise. */
  jetonsSortie: number;
}

const ZERO: Compteur = { requetes: 0, jetonsEntree: 0, jetonsSortie: 0 };

/** Stockage des compteurs, clés de période comme « jour:2026-11-14 » ou « mois:2026-11 ». */
export interface StockageUsageIA {
  lire(cle: string): Promise<Compteur>;
  /** Ajoute (ou retranche, si négatif) et renvoie le nouveau total, de façon atomique. */
  ajouter(cle: string, delta: Compteur): Promise<Compteur>;
}

export class StockageUsageIAMemoire implements StockageUsageIA {
  private readonly donnees = new Map<string, Compteur>();
  async lire(cle: string) {
    return { ...(this.donnees.get(cle) ?? ZERO) };
  }
  async ajouter(cle: string, delta: Compteur) {
    const c = { ...(this.donnees.get(cle) ?? ZERO) };
    c.requetes += delta.requetes;
    c.jetonsEntree += delta.jetonsEntree;
    c.jetonsSortie += delta.jetonsSortie;
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
  readonly jetonsEntreeReserves: number;
  readonly jetonsSortieReserves: number;
}

const oppose = (c: Compteur): Compteur => ({ requetes: -c.requetes, jetonsEntree: -c.jetonsEntree, jetonsSortie: -c.jetonsSortie });

export class PlafondIA {
  constructor(
    private readonly stockage: StockageUsageIA,
    private readonly seuils: SeuilsIA,
    private readonly maintenant: () => Date = () => new Date(),
  ) {}

  /** Réserve une requête et une estimation de jetons ; refuse sans rien consommer si un seuil serait dépassé. */
  async reserver(): Promise<Reservation> {
    const cles = clesPeriode(this.maintenant());
    const s = this.seuils;
    const delta: Compteur = { requetes: 1, jetonsEntree: s.jetonsEntreeReservesParAppel, jetonsSortie: s.jetonsSortieReservesParAppel };
    const jour = await this.stockage.ajouter(cles.jour, delta);
    if (jour.requetes > s.maxRequetesJour || jour.jetonsEntree > s.maxJetonsEntreeJour || jour.jetonsSortie > s.maxJetonsSortieJour) {
      await this.stockage.ajouter(cles.jour, oppose(delta));
      throw new PlafondAtteint("jour");
    }
    const mois = await this.stockage.ajouter(cles.mois, delta);
    if (mois.requetes > s.maxRequetesMois || mois.jetonsEntree > s.maxJetonsEntreeMois || mois.jetonsSortie > s.maxJetonsSortieMois) {
      await this.stockage.ajouter(cles.mois, oppose(delta));
      await this.stockage.ajouter(cles.jour, oppose(delta));
      throw new PlafondAtteint("mois");
    }
    return { cles, jetonsEntreeReserves: s.jetonsEntreeReservesParAppel, jetonsSortieReserves: s.jetonsSortieReservesParAppel };
  }

  /** Remplace l'estimation par l'usage réel ; usage inconnu : l'estimation réservée est conservée. */
  async enregistrer(r: Reservation, usage: UsageIA | undefined): Promise<void> {
    if (!usage) return;
    const delta: Compteur = { requetes: 0, jetonsEntree: usage.jetonsEntree - r.jetonsEntreeReserves, jetonsSortie: usage.jetonsSortie - r.jetonsSortieReserves };
    await this.stockage.ajouter(r.cles.jour, delta);
    await this.stockage.ajouter(r.cles.mois, delta);
  }

  /** Appel échoué avant toute facturation (réseau, refus HTTP) : rend la réservation. */
  async annuler(r: Reservation): Promise<void> {
    const delta: Compteur = { requetes: -1, jetonsEntree: -r.jetonsEntreeReserves, jetonsSortie: -r.jetonsSortieReserves };
    await this.stockage.ajouter(r.cles.jour, delta);
    await this.stockage.ajouter(r.cles.mois, delta);
  }
}

/** Enveloppe : réserve avant l'appel, refuse au-delà du seuil, enregistre l'usage réel après. */
export class ClientGeminiPlafonne implements ClientGemini {
  constructor(
    private readonly interne: ClientGemini,
    private readonly plafond: PlafondIA,
  ) {}

  private async proteger<T extends { usage?: UsageIA }>(appel: () => Promise<T>): Promise<T> {
    const r = await this.plafond.reserver();
    let res: T;
    try {
      res = await appel();
    } catch (e) {
      if (e instanceof SortieDicteeInvalide) {
        // Réponse reçue donc facturée : on compte l'usage réel (ou l'estimation s'il est inconnu).
        await this.plafond.enregistrer(r, e.usage);
      } else {
        await this.plafond.annuler(r);
      }
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
