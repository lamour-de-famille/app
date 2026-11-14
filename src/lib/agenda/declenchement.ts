import type { DepotFamille } from "../domaine/depot";
import { evenementsSouhaites } from "./evenements";
import { synchroniserFamille } from "./synchro";
import type { ClientAgenda, EtatSynchro, StockageEtatSynchro } from "./types";

/** Fabrique des clients Agenda par adulte. Un adulte sans client est signalé « a_reconnecter ». */
export type FabriqueClients = (adulteIds: string[]) => Promise<Record<string, ClientAgenda>>;

export interface ParametresDeclenchement {
  depot: DepotFamille;
  clients: FabriqueClients;
  stockage: StockageEtatSynchro;
  agendaId?: string;
}

type Etats = Record<string, EtatSynchro>;

async function executer({ depot, clients, stockage, agendaId }: ParametresDeclenchement): Promise<Etats> {
  const [famille, presences, transferts, creneaux] = await Promise.all([
    depot.lireFamille(),
    depot.listerPresences(),
    depot.listerTransferts(),
    depot.listerCreneaux(),
  ]);
  const souhaits = evenementsSouhaites({ famille, presences, transferts, creneaux });
  const parAdulte = await clients(Object.keys(souhaits));
  return synchroniserFamille({ souhaits, clients: parAdulte, ...(agendaId ? { agendaId } : {}) }, stockage);
}

// Verrou par processus : une synchro à la fois ; toute demande reçue pendant l'exécution
// est regroupée en une seule relance (avec les paramètres les plus récents).
let courante: Promise<Etats> | null = null;
let relance: Promise<Etats> | null = null;
let derniers: ParametresDeclenchement | null = null;

function lancer(p: ParametresDeclenchement): Promise<Etats> {
  const promesse: Promise<Etats> = executer(p).finally(() => {
    if (courante === promesse) courante = null;
  });
  courante = promesse;
  return promesse;
}

export function declencherSynchroAgenda(p: ParametresDeclenchement): Promise<Etats> {
  derniers = p;
  if (!courante) return lancer(p);
  if (!relance) {
    relance = courante
      .catch(() => undefined)
      .then(() => {
        relance = null;
        return lancer(derniers!);
      });
  }
  return relance;
}

export interface DependancesSynchro {
  depot: () => Promise<DepotFamille>;
  clients: FabriqueClients;
  stockage: StockageEtatSynchro;
}

/**
 * À appeler après une écriture, sans `await` côté action. `deps` remplace en partie les dépendances de production (ex. le dépôt déjà obtenu par la garde). Ne lève jamais : l'échec est journalisé
 * sans donnée sensible (nom de l'erreur seulement, jamais son message).
 */
export async function synchroApresModification(deps?: Partial<DependancesSynchro>): Promise<void> {
  try {
    const d = { ...(await import("./service-synchro")).dependancesParDefaut(), ...deps };
    await declencherSynchroAgenda({ ...d, depot: await d.depot() });
  } catch (e) {
    console.error("[synchro] échec de la synchro Agenda", e instanceof Error ? e.name : "inconnue");
  }
}
