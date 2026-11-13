import { ErreurVacances, type ClientVacances, type CritereVacances, type EnregistrementBrut } from "./types";

export const URL_VACANCES =
  "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records";
const PAGE = 100;
const PAGES_MAX = 20;
/** Contrainte de l'API Explore : offset + limit <= 10000. */
const OFFSET_LIMITE_MAX = 10_000;

/** Entoure une valeur de guillemets pour ODSQL ; rejette `"` et `\` plutôt que de supposer leur échappement. */
function litteral(v: string): string {
  if (/["\\]/.test(v)) {
    throw new ErreurVacances('Configuration des vacances invalide : les caractères " et \\ sont interdits dans les filtres');
  }
  return `"${v}"`;
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
        const decalage = page * PAGE;
        if (decalage + PAGE > OFFSET_LIMITE_MAX) {
          throw new ErreurVacances("Résultats des vacances trop nombreux : ajouter un filtre (année scolaire)");
        }
        const rep = await this.appelFetch(construireUrl(critere, decalage, this.base), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!rep.ok) throw new ErreurVacances(`Service des vacances indisponible (HTTP ${rep.status})`);
        const corps: unknown = await rep.json();
        const results = (corps as { results?: unknown } | null)?.results;
        if (!Array.isArray(results)) throw new ErreurVacances("Réponse des vacances inattendue");
        tous.push(...(results as EnregistrementBrut[]));
        if (results.length < PAGE) return tous;
        const total = (corps as { total_count?: unknown }).total_count;
        if (typeof total === "number" && tous.length >= total) return tous;
      }
      throw new ErreurVacances(
        `Résultats des vacances tronqués (limite de ${PAGES_MAX} pages atteinte) : ajouter un filtre (année scolaire)`,
      );
    } catch (e) {
      if (e instanceof ErreurVacances) throw e;
      throw new ErreurVacances("Service des vacances injoignable", { cause: e });
    }
  }
}
