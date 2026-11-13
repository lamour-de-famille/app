import { ErreurVacances, type ClientVacances, type CritereVacances, type EnregistrementBrut } from "./types";

export const URL_VACANCES =
  "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records";
const PAGE = 100;
const PAGES_MAX = 20;

/** Échappe une valeur pour la clause where ODSQL (guillemets doublés). */
function litteral(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export function construireUrl(critere: CritereVacances, decalage = 0, base = URL_VACANCES): string {
  const filtres: string[] = [];
  if (critere.zone) filtres.push(`zones=${litteral(critere.zone)}`);
  if (critere.academie) filtres.push(`location=${litteral(critere.academie)}`);
  if (critere.anneeScolaire) filtres.push(`annee_scolaire=${litteral(critere.anneeScolaire)}`);
  const p = new URLSearchParams({ limit: String(PAGE), offset: String(decalage), order_by: "start_date" });
  if (filtres.length) p.set("where", filtres.join(" and "));
  return `${base}?${p.toString()}`;
}

/** Client réel (jeu ouvert, sans clé). Jamais exécuté en test : `fetch` est injectable. */
export class ClientVacancesHttp implements ClientVacances {
  constructor(
    private readonly appelFetch: typeof fetch = fetch,
    private readonly base = URL_VACANCES,
  ) {}

  async recuperer(critere: CritereVacances): Promise<EnregistrementBrut[]> {
    const tous: EnregistrementBrut[] = [];
    try {
      for (let page = 0; page < PAGES_MAX; page++) {
        const rep = await this.appelFetch(construireUrl(critere, page * PAGE, this.base), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!rep.ok) throw new ErreurVacances(`Service des vacances indisponible (HTTP ${rep.status})`);
        const corps: unknown = await rep.json();
        const results = (corps as { results?: unknown } | null)?.results;
        if (!Array.isArray(results)) throw new ErreurVacances("Réponse des vacances inattendue");
        tous.push(...(results as EnregistrementBrut[]));
        if (results.length < PAGE) return tous;
      }
      return tous;
    } catch (e) {
      if (e instanceof ErreurVacances) throw e;
      throw new ErreurVacances("Service des vacances injoignable", { cause: e });
    }
  }
}
