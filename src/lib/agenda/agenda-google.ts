import {
  ErreurAutorisationExpiree,
  FUSEAU,
  type ClientAgenda,
  type EvenementAgenda,
  type FiltreListe,
  type NouvelEvenement,
} from "./types";

const BASE = "https://www.googleapis.com/calendar/v3/calendars";

interface EvenementGoogle {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}

const versGoogle = (e: NouvelEvenement) => {
  const horaire = (v: string) => (v.includes("T") ? { dateTime: `${v}:00`, timeZone: FUSEAU } : { date: v });
  return {
    summary: e.titre,
    description: e.description,
    location: e.lieu,
    start: horaire(e.debut),
    end: horaire(e.fin),
    extendedProperties: { private: e.proprietesPrivees },
  };
};

const depuisGoogle = (g: EvenementGoogle): EvenementAgenda => {
  const lire = (h?: { date?: string; dateTime?: string }) => h?.date ?? h?.dateTime?.slice(0, 16) ?? "";
  return {
    id: g.id ?? "",
    titre: g.summary ?? "",
    description: g.description,
    lieu: g.location,
    debut: lire(g.start),
    fin: lire(g.end),
    proprietesPrivees: g.extendedProperties?.private ?? {},
  };
};

/**
 * Implémentation HTTP de l'API Google Calendar. Jamais exécutée en test : aucun appel réel.
 * `jeton` fournit un jeton d'accès valide ; il doit lever `ErreurAutorisationExpiree` sur `invalid_grant`.
 */
export class ClientAgendaGoogle implements ClientAgenda {
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

  async lister(agendaId: string, filtre?: FiltreListe): Promise<EvenementAgenda[]> {
    const resultat: EvenementAgenda[] = [];
    let page: string | undefined;
    do {
      const u = new URL(`${BASE}/${encodeURIComponent(agendaId)}/events`);
      u.searchParams.set("maxResults", "250");
      u.searchParams.set("showDeleted", "false");
      for (const [k, v] of Object.entries(filtre?.proprietesPrivees ?? {})) {
        u.searchParams.append("privateExtendedProperty", `${k}=${v}`);
      }
      if (page) u.searchParams.set("pageToken", page);
      const r = await this.requete("GET", u.toString());
      if (!r.ok) throw new Error(`Agenda : liste refusée (${r.status})`);
      const corps = (await r.json()) as { items?: EvenementGoogle[]; nextPageToken?: string };
      resultat.push(...(corps.items ?? []).map(depuisGoogle));
      page = corps.nextPageToken;
    } while (page);
    return resultat;
  }

  async creer(agendaId: string, evenement: NouvelEvenement): Promise<EvenementAgenda> {
    const r = await this.requete("POST", `${BASE}/${encodeURIComponent(agendaId)}/events`, versGoogle(evenement));
    if (!r.ok) throw new Error(`Agenda : création refusée (${r.status})`);
    return depuisGoogle((await r.json()) as EvenementGoogle);
  }

  async mettreAJour(agendaId: string, id: string, evenement: NouvelEvenement): Promise<EvenementAgenda> {
    const r = await this.requete(
      "PUT",
      `${BASE}/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(id)}`,
      versGoogle(evenement),
    );
    if (!r.ok) throw new Error(`Agenda : modification refusée (${r.status})`);
    return depuisGoogle((await r.json()) as EvenementGoogle);
  }

  async supprimer(agendaId: string, id: string): Promise<void> {
    const r = await this.requete("DELETE", `${BASE}/${encodeURIComponent(agendaId)}/events/${encodeURIComponent(id)}`);
    // 404/410 : déjà supprimé, le résultat voulu est atteint.
    if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Agenda : suppression refusée (${r.status})`);
  }
}
