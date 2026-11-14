import { ErreurAutorisationExpiree, type EtatSynchro, type StockageEtatSynchro } from "../agenda/types";
import type { ResultatSynchro } from "../agenda/synchro";
import { ErreurDomaine } from "../domaine/depot";
import type { DateJour, Famille } from "../domaine/types";
import { ajouterJours } from "../regles/dates";
import type { DepotTaches } from "../taches/depot";
import { developperOccurrences, occurrenceSansDate } from "../taches/occurrences";
import type { Occurrence } from "../taches/types";
import { empreinte, encoderNotes, lireMarque } from "./marque";
import { TITRE_LISTE_DEFAUT, type ClientTasks, type NouvelleTacheGoogle, type TacheGoogle, type TacheSouhaitee } from "./types";

export interface OptionsFenetreTasks {
  /** Jours à venir synchronisés, aujourd'hui compris (défaut 14). */
  joursAvenir?: number;
  /** Profondeur du retard des séries récurrentes, en jours (défaut 60, comme la vue de l'application). */
  joursRattrapage?: number;
}

/**
 * Tâches voulues dans la liste Google Tasks de `adulteId` : UNIQUEMENT celles dont il est l'assigné, non faites,
 * en retard (le sien), à venir dans la fenêtre, ou sans échéance. Rien de l'autre adulte, jamais : ni à venir,
 * ni retard. Le filtre sur l'assigné est posé avant le développement des occurrences, puis revérifié.
 */
export async function tachesSouhaitees(
  depot: DepotTaches,
  famille: Famille,
  adulteId: string,
  options: OptionsFenetreTasks = {},
): Promise<TacheSouhaitee[]> {
  if (!famille.adultes.some((a) => a.id === adulteId)) throw new ErreurDomaine(`Adulte inconnu : ${adulteId}`);
  const avenir = options.joursAvenir ?? 14;
  const retard = options.joursRattrapage ?? 60;
  for (const [nom, v] of [["joursAvenir", avenir], ["joursRattrapage", retard]] as const) {
    if (!Number.isInteger(v) || v < 0) throw new ErreurDomaine(`${nom} : entier >= 0`);
  }
  const aujourdhui = depot.aujourdhui();
  const au = ajouterJours(aujourdhui, avenir);
  const debutSerie = ajouterJours(aujourdhui, -retard);

  const occurrences: Occurrence[] = [];
  for (const tache of await depot.lister()) {
    if (tache.assigneId !== adulteId) continue;
    const sans = occurrenceSansDate(tache);
    if (sans) occurrences.push(sans);
    else occurrences.push(...developperOccurrences(tache, tache.recurrence ? debutSerie : "0000-01-01", au));
  }
  const enfant = (id?: string) => famille.enfants.find((e) => e.id === id)?.prenom;
  return occurrences
    .filter((o) => o.statut === "a_faire" && o.assigneId === adulteId)
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.cle.localeCompare(b.cle))
    .map((o): TacheSouhaitee => {
      const pour = enfant(o.enfantId);
      return {
        cle: o.cle,
        titre: o.titre,
        ...(pour ? { notes: `Pour : ${pour}` } : {}),
        ...(o.date ? { echeance: o.date as DateJour } : {}),
      };
    });
}

export const versNouvelleTacheGoogle = (t: TacheSouhaitee): NouvelleTacheGoogle => ({
  titre: t.titre,
  notes: encoderNotes(t),
  ...(t.echeance ? { echeance: t.echeance } : {}),
});

/**
 * Aligne une liste Google Tasks sur les tâches voulues. La liste est la source de vérité de ce qui existe
 * (seules les tâches portant la marque sont considérées) : relancer ne crée jamais de doublon, même après une
 * coupure. Une tâche sans marque n'est jamais modifiée ni supprimée.
 * Cochée dans Google Tasks : la coche est ignorée (voir ADR 0015) ; la tâche n'est ni recréée ni décochée.
 */
export async function synchroniserListeTasks(
  client: ClientTasks,
  listeId: string,
  souhaits: TacheSouhaitee[],
): Promise<ResultatSynchro> {
  const r: ResultatSynchro = { crees: 0, modifies: 0, supprimes: 0, inchanges: 0, erreurs: [], aReconnecter: false };
  const voulus = new Map<string, TacheSouhaitee>();
  for (const s of souhaits) voulus.set(s.cle, s);

  const parCle = new Map<string, TacheGoogle>();
  const aSupprimer: { tache: TacheGoogle; cle: string }[] = [];
  for (const t of await client.lister(listeId)) {
    const marque = lireMarque(t.notes);
    if (!marque) continue; // étrangère : intouchable
    if (!voulus.has(marque.cle) || parCle.has(marque.cle)) aSupprimer.push({ tache: t, cle: marque.cle });
    else parCle.set(marque.cle, t);
  }

  const tenter = async (quoi: string, action: () => Promise<void>, compteur: "crees" | "modifies" | "supprimes") => {
    try {
      await action();
      r[compteur]++;
    } catch (e) {
      if (e instanceof ErreurAutorisationExpiree) throw e;
      r.erreurs.push(`${quoi} : ${e instanceof Error ? e.message : "erreur inconnue"}`);
    }
  };

  try {
    for (const s of voulus.values()) {
      const existante = parCle.get(s.cle);
      if (!existante) {
        await tenter(`création ${s.cle}`, async () => void (await client.creer(listeId, versNouvelleTacheGoogle(s))), "crees");
      } else if (lireMarque(existante.notes)!.empreinte !== empreinte(s)) {
        await tenter(
          `modification ${s.cle}`,
          async () => void (await client.mettreAJour(listeId, existante.id, versNouvelleTacheGoogle(s))),
          "modifies",
        );
      } else {
        r.inchanges++;
      }
    }
    for (const { tache, cle } of aSupprimer) {
      await tenter(`suppression ${cle}`, () => client.supprimer(listeId, tache.id), "supprimes");
    }
  } catch (e) {
    if (!(e instanceof ErreurAutorisationExpiree)) throw e;
    r.aReconnecter = true;
    r.erreurs.push(e.message);
  }
  return r;
}

export interface EntreeTasksFamille extends OptionsFenetreTasks {
  depot: DepotTaches;
  famille: Famille;
  /** Client authentifié de chaque adulte : jamais celui d'un autre. */
  clients: Record<string, ClientTasks>;
  /** Titre de la liste dédiée (défaut « L'amour de famille »). */
  titreListe?: string;
}

/**
 * Point d'entrée du déclencheur : synchronise la liste Google Tasks de chaque adulte de la famille et enregistre
 * l'état visible. `stockage` doit être distinct de celui de l'Agenda (même modèle d'état, même clé `adulteId`).
 * Ne lève pas pour une erreur attendue ; adulte sans client ou autorisation expirée : « a_reconnecter ».
 */
export async function synchroniserTasksFamille(
  entree: EntreeTasksFamille,
  stockage: StockageEtatSynchro,
  maintenant: () => Date = () => new Date(),
): Promise<Record<string, EtatSynchro>> {
  const etats: Record<string, EtatSynchro> = {};
  for (const { id: adulteId } of entree.famille.adultes) {
    const avant = await stockage.lire(adulteId);
    const client = entree.clients[adulteId];
    const quand = maintenant().toISOString();
    let etat: EtatSynchro;
    if (!client) {
      etat = { ...base(adulteId, avant), statut: "a_reconnecter", derniereTentative: quand, erreurs: ["Aucune autorisation Google pour cet adulte"] };
    } else {
      try {
        const souhaits = await tachesSouhaitees(entree.depot, entree.famille, adulteId, entree);
        const listeId = await client.idListe(entree.titreListe ?? TITRE_LISTE_DEFAUT);
        const r = await synchroniserListeTasks(client, listeId, souhaits);
        const ok = r.erreurs.length === 0;
        etat = {
          ...base(adulteId, avant),
          statut: ok ? "ok" : r.aReconnecter ? "a_reconnecter" : "erreur",
          derniereTentative: quand,
          ...(ok ? { dernierSucces: quand } : {}),
          erreurs: r.erreurs,
          nombreElements: r.aReconnecter ? (avant?.nombreElements ?? 0) : souhaits.length - r.erreurs.length,
          crees: r.crees,
          modifies: r.modifies,
          supprimes: r.supprimes,
        };
      } catch (e) {
        etat = {
          ...base(adulteId, avant),
          statut: e instanceof ErreurAutorisationExpiree ? "a_reconnecter" : "erreur",
          derniereTentative: quand,
          erreurs: [e instanceof Error ? e.message : "erreur inconnue"],
        };
      }
    }
    await stockage.ecrire(etat);
    etats[adulteId] = etat;
  }
  return etats;
}

function base(adulteId: string, avant: EtatSynchro | undefined): EtatSynchro {
  return {
    adulteId,
    statut: avant?.statut ?? "jamais",
    dernierSucces: avant?.dernierSucces,
    derniereTentative: avant?.derniereTentative,
    erreurs: [],
    nombreElements: avant?.nombreElements ?? 0,
    crees: 0,
    modifies: 0,
    supprimes: 0,
  };
}
