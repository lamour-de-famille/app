/**
 * Assemblage serveur de la dictée. Pour l'instant SEULE la démonstration (MODE_DEMO=1, hors production) est
 * câblée, avec des doublures : aucun appel réel. En production, tant que les adaptateurs Firestore des tâches,
 * des notes, des abonnements et des compteurs n'existent pas, la route répond « non configuré » (503) plutôt
 * que d'écrire dans une mémoire volatile ou d'appeler Gemini sans plafond persistant (voir ADR 0016).
 */
import { ErreurNonConfigure } from "../acces/depot";
import { modeDemoActif } from "../acces/acces";
import { ClientGeminiFactice } from "../ia/client-gemini-factice";
import { configurationIADepuisEnv } from "../ia/configuration";
import { ClientGeminiPlafonne, PlafondIA, StockageUsageIAMemoire } from "../ia/plafond";
// Imports ciblés (pas le barrel `../notifications`, qui tire l'envoyeur web-push réel dans le build des routes).
import { EnvoyeurPushFactice } from "../notifications/envoyeur-factice";
import { ServiceNotifications } from "../notifications/service";
import { FileRegroupementMemoire, StockageAbonnementsMemoire, StockageCompteurMemoire } from "../notifications/stockages-memoire";
import { DepotTachesMemoire } from "../taches";
import { NotesFamilleMemoire } from "./notes";
import type { DependancesRoutes } from "./routes";
import { DicteeService } from "./service";
import { StockagePropositionsMemoire } from "./stockage-propositions";

interface Partage {
  propositions: StockagePropositionsMemoire;
  notes: NotesFamilleMemoire;
  usage: StockageUsageIAMemoire;
  depotTaches?: DepotTachesMemoire;
  notifications?: ServiceNotifications;
}

const g = globalThis as { __dicteeDemo?: Partage };

export function dependancesParDefaut(): DependancesRoutes {
  return {
    env: process.env,
    async service({ depot, env }) {
      if (!modeDemoActif(env)) throw new ErreurNonConfigure("Dictée non branchée en production.");
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
    },
  };
}
