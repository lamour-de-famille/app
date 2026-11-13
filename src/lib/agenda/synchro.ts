import { createHash } from "node:crypto";
import {
  ErreurAutorisationExpiree,
  MARQUE_APPLICATION,
  type ClientAgenda,
  type EtatSynchro,
  type EvenementAgenda,
  type EvenementSouhaite,
  type NouvelEvenement,
  type StockageEtatSynchro,
} from "./types";

export const PROP_APPLICATION = "application";
export const PROP_CLE = "cle";
export const PROP_EMPREINTE = "empreinte";

/** Empreinte du contenu voulu : change si et seulement si l'événement doit être mis à jour. */
export function empreinte(e: EvenementSouhaite): string {
  const contenu = JSON.stringify([e.titre, e.description ?? "", e.lieu ?? "", e.debut, e.fin]);
  return createHash("sha256").update(contenu).digest("hex").slice(0, 16);
}

export function versNouvelEvenement(e: EvenementSouhaite): NouvelEvenement {
  return {
    titre: e.titre,
    ...(e.description ? { description: e.description } : {}),
    ...(e.lieu ? { lieu: e.lieu } : {}),
    debut: e.debut,
    fin: e.fin,
    proprietesPrivees: {
      [PROP_APPLICATION]: MARQUE_APPLICATION,
      [PROP_CLE]: e.cle,
      [PROP_EMPREINTE]: empreinte(e),
    },
  };
}

/** Un événement est « à nous » seulement s'il porte la marque de l'application et une clé. */
export const estMarque = (e: EvenementAgenda): boolean =>
  e.proprietesPrivees[PROP_APPLICATION] === MARQUE_APPLICATION && Boolean(e.proprietesPrivees[PROP_CLE]);

export interface ResultatSynchro {
  crees: number;
  modifies: number;
  supprimes: number;
  inchanges: number;
  erreurs: string[];
  aReconnecter: boolean;
}

/**
 * Aligne l'agenda sur les événements voulus. L'agenda est la source de vérité de ce qui existe
 * (liste filtrée par la marque, puis refiltrée localement) : relancer ne crée donc jamais de doublon,
 * même après une coupure. Un événement sans marque n'est jamais modifié ni supprimé.
 */
export async function synchroniserAgenda(
  client: ClientAgenda,
  agendaId: string,
  souhaits: EvenementSouhaite[],
): Promise<ResultatSynchro> {
  const r: ResultatSynchro = { crees: 0, modifies: 0, supprimes: 0, inchanges: 0, erreurs: [], aReconnecter: false };
  const voulus = new Map<string, EvenementSouhaite>();
  for (const s of souhaits) voulus.set(s.cle, s);

  const existants = (await client.lister(agendaId, { proprietesPrivees: { [PROP_APPLICATION]: MARQUE_APPLICATION } })).filter(
    estMarque,
  );
  const parCle = new Map<string, EvenementAgenda>();
  const aSupprimer: EvenementAgenda[] = [];
  for (const e of existants) {
    const cle = e.proprietesPrivees[PROP_CLE]!;
    if (!voulus.has(cle) || parCle.has(cle)) aSupprimer.push(e); // disparu, ou doublon d'une coupure passée
    else parCle.set(cle, e);
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
      const existant = parCle.get(s.cle);
      if (!existant) {
        await tenter(`création ${s.cle}`, async () => void (await client.creer(agendaId, versNouvelEvenement(s))), "crees");
      } else if (existant.proprietesPrivees[PROP_EMPREINTE] !== empreinte(s)) {
        await tenter(
          `modification ${s.cle}`,
          async () => void (await client.mettreAJour(agendaId, existant.id, versNouvelEvenement(s))),
          "modifies",
        );
      } else {
        r.inchanges++;
      }
    }
    for (const e of aSupprimer) {
      await tenter(`suppression ${e.proprietesPrivees[PROP_CLE]}`, () => client.supprimer(agendaId, e.id), "supprimes");
    }
  } catch (e) {
    if (!(e instanceof ErreurAutorisationExpiree)) throw e;
    r.aReconnecter = true;
    r.erreurs.push(e.message);
  }
  return r;
}

export interface EntreeFamille {
  /** Événements voulus par adulte (voir `evenementsSouhaites`). */
  souhaits: Record<string, EvenementSouhaite[]>;
  /** Client authentifié de chaque adulte : jamais celui d'un autre. */
  clients: Record<string, ClientAgenda>;
  /** Agenda personnel de chaque adulte (« primary » par défaut). */
  agendaId?: string;
}

/** Synchronise l'agenda de chaque adulte et enregistre l'état visible. Ne lève pas pour une erreur attendue. */
export async function synchroniserFamille(
  entree: EntreeFamille,
  stockage: StockageEtatSynchro,
  maintenant: () => Date = () => new Date(),
): Promise<Record<string, EtatSynchro>> {
  const etats: Record<string, EtatSynchro> = {};
  for (const [adulteId, souhaits] of Object.entries(entree.souhaits)) {
    const avant = await stockage.lire(adulteId);
    const client = entree.clients[adulteId];
    const quand = maintenant().toISOString();
    let etat: EtatSynchro;
    if (!client) {
      etat = { ...base(adulteId, avant), statut: "a_reconnecter", derniereTentative: quand, erreurs: ["Aucune autorisation Google pour cet adulte"] };
    } else {
      try {
        const r = await synchroniserAgenda(client, entree.agendaId ?? "primary", souhaits);
        const ok = r.erreurs.length === 0;
        etat = {
          ...base(adulteId, avant),
          statut: ok ? "ok" : r.aReconnecter ? "a_reconnecter" : "erreur",
          derniereTentative: quand,
          ...(ok ? { dernierSucces: quand } : {}),
          erreurs: r.erreurs,
          // En cas d'interruption, on garde le dernier compte connu plutôt qu'un chiffre partiel.
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
