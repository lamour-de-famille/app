import type { Env } from "../acces/acces";
import { controlerAcces } from "../acces/garde";
import { obtenirDepot } from "../acces/depot";
import { ClientGeminiHttp } from "../ia/client-gemini-http";
import { configurationIADepuisEnv } from "../ia/configuration";
import { ClientGeminiPlafonne, PlafondIA, StockageUsageIAMemoire, clesPeriode } from "../ia/plafond";
import type { ClientGemini } from "../ia/types";
import { DepotTachesMemoire } from "../taches/depot-memoire";
import type { DepotTaches } from "../taches/depot";
import { configurationRecapitulatifDepuisEnv } from "./configuration";
import { EnvoyeurPushFactice } from "./envoyeur-factice";
import { EnvoyeurPushWebPush, configurationVapidDepuisEnv } from "./envoyeur-web-push";
import { StockagePreferencesMemoire } from "./preferences";
import { RecapitulatifService } from "./recapitulatif";
import { FileRegroupementMemoire, StockageAbonnementsMemoire, StockageCompteurMemoire } from "./stockages-memoire";
import type { DependancesRouteAbonnement } from "./acces-notifications";

/**
 * Câblage de production. Les stockages sont en mémoire (un par processus) tant que la version Firestore n'existe
 * pas : voir ADR 0017, limites. Sans clé Gemini ou sans clés VAPID, le service reste utilisable (repli, aucun envoi).
 */
interface Partage {
  abonnements: StockageAbonnementsMemoire;
  file: FileRegroupementMemoire;
  preferences: StockagePreferencesMemoire;
  envois: StockageCompteurMemoire;
  usageIA: StockageUsageIAMemoire;
  taches?: DepotTaches;
}
const CLE = Symbol.for("lamour.notifications");
type Global = { [CLE]?: Partage };

export function partage(): Partage {
  const g = globalThis as unknown as Global;
  return (g[CLE] ??= {
    abonnements: new StockageAbonnementsMemoire(),
    file: new FileRegroupementMemoire(),
    preferences: new StockagePreferencesMemoire(),
    envois: new StockageCompteurMemoire(),
    usageIA: new StockageUsageIAMemoire(),
  });
}

function geminiParDefaut(env: Env): ClientGemini {
  const cle = env.GEMINI_API_KEY?.trim();
  if (!cle) {
    // Sans clé : chaque appel échoue, le récapitulatif prend son texte de repli.
    return { traiterDictee: () => Promise.reject(new Error("GEMINI_API_KEY manquante.")), rediger: () => Promise.reject(new Error("GEMINI_API_KEY manquante.")) };
  }
  const c = configurationIADepuisEnv(env);
  return new ClientGeminiPlafonne(new ClientGeminiHttp(cle, c.modele), new PlafondIA(partage().usageIA, c.seuils));
}

export async function recapitulatifParDefaut(env: Env = process.env, maintenant: () => Date = () => new Date()): Promise<RecapitulatifService> {
  const p = partage();
  const depot = await obtenirDepot(clesPeriode(maintenant()).jour.slice("jour:".length), env);
  const famille = await depot.lireFamille();
  const vapid = configurationVapidDepuisEnv(env);
  return new RecapitulatifService({
    depot,
    // Pas encore de dépôt de tâches en base : mémoire du processus (voir ADR 0017).
    taches: (p.taches ??= new DepotTachesMemoire(famille, { maintenant })),
    abonnements: p.abonnements,
    envoyeur: vapid ? new EnvoyeurPushWebPush(vapid) : new EnvoyeurPushFactice(),
    gemini: geminiParDefaut(env),
    file: p.file,
    preferences: p.preferences,
    envois: p.envois,
    heureParDefaut: configurationRecapitulatifDepuisEnv(env).heureParDefaut,
  });
}

export function dependancesAbonnementParDefaut(env: Env = process.env): DependancesRouteAbonnement {
  return {
    env,
    abonnements: partage().abonnements,
    // Session vérifiée d'abord (sans base) ; la famille n'est lue qu'ensuite par la garde.
    adulteConnecte: async (jeton) => {
      const r = await controlerAcces({ env, date: clesPeriode(new Date()).jour.slice("jour:".length), jeton }).catch(() => null);
      return r?.ok ? r.adulteId : null;
    },
  };
}
