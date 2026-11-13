/** Petit état local des affaires cochées : pur, sans réseau, stockage injectable. */

export type EtatAffaires = Record<string, true>;

export interface StockageCle {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
}

/** Listes d'affaires fictives par enfant (id), en attendant leur saisie par les adultes. */
export const AFFAIRES_FICTIVES: Record<string, string[]> = {
  leo: ["Cartable", "Maillot de sport"],
  mila: ["Doudou", "Cahier de liaison"],
  nina: ["Doudou", "Trousse de toilette"],
};

export function basculer(etat: EtatAffaires, cle: string): EtatAffaires {
  const suivant = { ...etat };
  if (suivant[cle]) delete suivant[cle];
  else suivant[cle] = true;
  return suivant;
}

const nomStockage = (adulteId: string) => `affaires:${adulteId}`;

export function charger(stockage: StockageCle, adulteId: string): EtatAffaires {
  try {
    const brut = stockage.getItem(nomStockage(adulteId));
    if (!brut) return {};
    const lu: unknown = JSON.parse(brut);
    if (typeof lu !== "object" || lu === null || Array.isArray(lu)) return {};
    const etat: EtatAffaires = {};
    for (const [cle, v] of Object.entries(lu)) if (v === true) etat[cle] = true;
    return etat;
  } catch {
    return {};
  }
}

export function enregistrer(stockage: StockageCle, adulteId: string, etat: EtatAffaires): void {
  try {
    stockage.setItem(nomStockage(adulteId), JSON.stringify(etat));
  } catch {
    // Stockage indisponible : l'état reste valable pour la session en cours.
  }
}

/** Stockage en mémoire pour les tests. */
export function memoireVolatile(): StockageCle {
  const m = new Map<string, string>();
  return { getItem: (c) => m.get(c) ?? null, setItem: (c, v) => void m.set(c, v) };
}
