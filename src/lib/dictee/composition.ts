/**
 * Assemblage serveur de la dictée. RÉSERVÉ AU SERVEUR.
 *
 * - Démonstration (MODE_DEMO=1, hors production) : doublures en mémoire, aucun appel réel.
 * - Production : tâches, notes, propositions et compteurs d'usage IA en Firestore (famille FAMILLE_ID, banque
 *   unique du processus) ; client Gemini réel (GEMINI_API_KEY, GEMINI_MODEL) TOUJOURS enveloppé par le plafond,
 *   y compris le client `rediger` du service de notifications. Sans clé : 503 « Dictée non configurée. », aucun
 *   appel. Les stockages de notifications (abonnements, compteurs, file) restent provisoires en mémoire : voir
 *   ADR 0019 ; sans abonnement enregistré, aucune notification n'est envoyée.
 */
import { ErreurNonConfigure, banqueUnique } from "../acces/depot";
import { modeDemoActif, type Env } from "../acces/acces";
import type { DepotFamille } from "../domaine/depot";
import type { Banque } from "../firestore/banque";
import { DepotTachesFirestore } from "../firestore/depot-taches-firestore";
import { NotesFamilleFirestore } from "../firestore/notes-firestore";
import { StockagePropositionsFirestore } from "../firestore/propositions-firestore";
import { StockageUsageIAFirestore } from "../firestore/usage-ia-firestore";
import { ClientGeminiFactice } from "../ia/client-gemini-factice";
import { ClientGeminiHttp } from "../ia/client-gemini-http";
import { configurationIADepuisEnv } from "../ia/configuration";
import { ClientGeminiPlafonne, PlafondIA, StockageUsageIAMemoire, type StockageUsageIA } from "../ia/plafond";
import type { ClientGemini } from "../ia/types";
// Imports ciblés (pas le barrel `../notifications`, qui tire l'envoyeur web-push réel dans le build des routes).
import { EnvoyeurPushFactice } from "../notifications/envoyeur-factice";
import { ServiceNotifications } from "../notifications/service";
import { FileRegroupementMemoire, StockageAbonnementsMemoire, StockageCompteurMemoire } from "../notifications/stockages-memoire";
import { DepotTachesMemoire } from "../taches";
import { NotesFamilleMemoire } from "./notes";
import type { DependancesRoutes } from "./routes";
import { DicteeService } from "./service";
import { StockagePropositionsMemoire } from "./stockage-propositions";
import { DicteeNonConfiguree } from "./types";

interface Partage {
  propositions: StockagePropositionsMemoire;
  notes: NotesFamilleMemoire;
  usage: StockageUsageIAMemoire;
  depotTaches?: DepotTachesMemoire;
  notifications?: ServiceNotifications;
}

const g = globalThis as { __dicteeDemo?: Partage };

/**
 * Client Gemini de production : clé obligatoire (sinon `DicteeNonConfiguree`, avant tout appel), toujours
 * enveloppé par le plafond adossé au stockage d'usage donné. Un seul client sert la dictée ET la rédaction.
 */
export function clientGeminiPlafonne(env: Env, usage: StockageUsageIA, appeler: typeof fetch = fetch): ClientGemini {
  const cle = env.GEMINI_API_KEY?.trim();
  if (!cle) throw new DicteeNonConfiguree();
  const config = configurationIADepuisEnv(env);
  return new ClientGeminiPlafonne(new ClientGeminiHttp(cle, config.modele, appeler), new PlafondIA(usage, config.seuils));
}

export interface OptionsComposition {
  /** Remplace `fetch` (tests : aucun appel réseau réel). */
  appeler?: typeof fetch;
}

async function serviceProduction(depot: DepotFamille, env: Env, banqueRoute: Banque | undefined, options: OptionsComposition): Promise<DicteeService> {
  const familleId = env.FAMILLE_ID?.trim();
  if (!familleId) throw new ErreurNonConfigure("Application non configurée : FAMILLE_ID manquant.");
  // La clé est vérifiée avant toute connexion : sans elle, rien n'est ouvert ni appelé.
  if (!env.GEMINI_API_KEY?.trim()) throw new DicteeNonConfiguree();
  const projectId = env.FIRESTORE_PROJECT_ID?.trim();
  if (!banqueRoute && !projectId) throw new ErreurNonConfigure("Application non configurée : FIRESTORE_PROJECT_ID manquant.");
  const banque = banqueRoute ?? (await banqueUnique(projectId!));
  const config = configurationIADepuisEnv(env);
  const gemini = clientGeminiPlafonne(env, new StockageUsageIAFirestore(banque, familleId), options.appeler);
  return new DicteeService({
    depotFamille: depot,
    depotTaches: new DepotTachesFirestore(banque, familleId),
    notes: new NotesFamilleFirestore(banque, familleId),
    propositions: new StockagePropositionsFirestore(banque, familleId),
    gemini,
    // Provisoire (autre PR) : stockages de notifications en mémoire, mais la rédaction passe par le même client plafonné.
    notifications: new ServiceNotifications({
      abonnements: new StockageAbonnementsMemoire(),
      envoyeur: new EnvoyeurPushFactice(),
      gemini,
      compteur: new StockageCompteurMemoire(),
      file: new FileRegroupementMemoire(),
    }),
    maxOctetsAudio: config.maxOctetsAudio,
  });
}

async function serviceDemo(depot: DepotFamille, env: Env): Promise<DicteeService> {
  const partage = (g.__dicteeDemo ??= { propositions: new StockagePropositionsMemoire(), notes: new NotesFamilleMemoire(), usage: new StockageUsageIAMemoire() });
  const config = configurationIADepuisEnv(env);
  const famille = await depot.lireFamille();
  partage.depotTaches ??= new DepotTachesMemoire(famille);
  partage.notifications ??= new ServiceNotifications({
    abonnements: new StockageAbonnementsMemoire(),
    envoyeur: new EnvoyeurPushFactice(),
    gemini: new ClientGeminiFactice(),
    compteur: new StockageCompteurMemoire(),
    file: new FileRegroupementMemoire(),
  });
  return new DicteeService({
    depotFamille: depot,
    depotTaches: partage.depotTaches,
    notes: partage.notes,
    propositions: partage.propositions,
    gemini: new ClientGeminiPlafonne(new ClientGeminiFactice(), new PlafondIA(partage.usage, config.seuils)),
    notifications: partage.notifications,
    maxOctetsAudio: config.maxOctetsAudio,
  });
}

export function dependancesParDefaut(options: OptionsComposition = {}): DependancesRoutes {
  return {
    env: process.env,
    service: ({ depot, env, banque }) => (modeDemoActif(env) ? serviceDemo(depot, env) : serviceProduction(depot, env, banque, options)),
  };
}
