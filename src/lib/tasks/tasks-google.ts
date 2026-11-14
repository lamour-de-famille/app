import { ErreurAutorisationExpiree } from "../agenda/types";
import type { DateJour } from "../domaine/types";
import type { ClientTasks, NouvelleTacheGoogle, TacheGoogle } from "./types";

const BASE = "https://tasks.googleapis.com/tasks/v1";

interface TacheApi {
  id?: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: string;
}

const depuisGoogle = (g: TacheApi): TacheGoogle => ({
  id: g.id ?? "",
  titre: g.title ?? "",
  notes: g.notes ?? "",
  ...(g.due ? { echeance: g.due.slice(0, 10) as DateJour } : {}),
  terminee: g.status === "completed",
});

/** `due` : date seule, minuit UTC (Google Tasks ignore l'heure). `null` efface l'échéance. Jamais de `status`. */
const versGoogle = (t: NouvelleTacheGoogle) => ({
  title: t.titre,
  notes: t.notes,
  due: t.echeance ? `${t.echeance}T00:00:00.000Z` : null,
});

/**
 * Implémentation HTTP de l'API Google Tasks. Jamais exécutée en test : aucun appel réel.
 * `jeton` fournit un jeton d'accès valide ; il doit lever `ErreurAutorisationExpiree` sur `invalid_grant`.
 */
export class ClientTasksGoogle implements ClientTasks {
  constructor(
    private readonly jeton: () => Promise<string>,
    private readonly appelReseau: typeof fetch = fetch,
  ) {}

  private async requete(methode: string, url: string, corps?: unknown): Promise<Response> {
    const reponse = await this.appelReseau(url, {
      method: methode,
      headers: { authorization: `Bearer ${await this.jeton()}`, "content-type": "application/json" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    if (reponse.status === 401) throw new ErreurAutorisationExpiree();
    return reponse;
  }

  async idListe(titre: string): Promise<string> {
    let page: string | undefined;
    do {
      const u = new URL(`${BASE}/users/@me/lists`);
      u.searchParams.set("maxResults", "100");
      if (page) u.searchParams.set("pageToken", page);
      const r = await this.requete("GET", u.toString());
      if (!r.ok) throw new Error(`Tasks : listes refusées (${r.status})`);
      const corps = (await r.json()) as { items?: { id?: string; title?: string }[]; nextPageToken?: string };
      const trouvee = (corps.items ?? []).find((l) => l.title === titre && l.id);
      if (trouvee) return trouvee.id!;
      page = corps.nextPageToken;
    } while (page);
    const r = await this.requete("POST", `${BASE}/users/@me/lists`, { title: titre });
    if (!r.ok) throw new Error(`Tasks : création de la liste refusée (${r.status})`);
    return ((await r.json()) as { id: string }).id;
  }

  async lister(listeId: string): Promise<TacheGoogle[]> {
    const resultat: TacheGoogle[] = [];
    let page: string | undefined;
    do {
      const u = new URL(`${BASE}/lists/${encodeURIComponent(listeId)}/tasks`);
      u.searchParams.set("maxResults", "100");
      u.searchParams.set("showCompleted", "true");
      u.searchParams.set("showHidden", "true");
      if (page) u.searchParams.set("pageToken", page);
      const r = await this.requete("GET", u.toString());
      if (!r.ok) throw new Error(`Tasks : liste refusée (${r.status})`);
      const corps = (await r.json()) as { items?: TacheApi[]; nextPageToken?: string };
      resultat.push(...(corps.items ?? []).map(depuisGoogle));
      page = corps.nextPageToken;
    } while (page);
    return resultat;
  }

  async creer(listeId: string, tache: NouvelleTacheGoogle): Promise<TacheGoogle> {
    const r = await this.requete("POST", `${BASE}/lists/${encodeURIComponent(listeId)}/tasks`, versGoogle(tache));
    if (!r.ok) throw new Error(`Tasks : création refusée (${r.status})`);
    return depuisGoogle((await r.json()) as TacheApi);
  }

  async mettreAJour(listeId: string, id: string, tache: NouvelleTacheGoogle): Promise<TacheGoogle> {
    // PATCH : l'état coché n'est pas envoyé, donc pas modifié.
    const r = await this.requete(
      "PATCH",
      `${BASE}/lists/${encodeURIComponent(listeId)}/tasks/${encodeURIComponent(id)}`,
      versGoogle(tache),
    );
    if (!r.ok) throw new Error(`Tasks : modification refusée (${r.status})`);
    return depuisGoogle((await r.json()) as TacheApi);
  }

  async supprimer(listeId: string, id: string): Promise<void> {
    const r = await this.requete("DELETE", `${BASE}/lists/${encodeURIComponent(listeId)}/tasks/${encodeURIComponent(id)}`);
    if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Tasks : suppression refusée (${r.status})`);
  }
}
