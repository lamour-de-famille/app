import type { EtatPastille } from "@/components/PastilleEnfant";
import type { DateJour, DemandeEchange, Famille, Garde, Presence, Transfert } from "@/lib/domaine/types";
import { choisirVueAujourdhui, etatDuLieu, type EntreeAujourdhui, type ProchainTransfert } from "./aujourdhui";
import { grilleMois, moisAdjacent } from "./mois";

export type FormeRepere = "plein" | "contour" | "tiers" | "inconnu";

export interface Repere {
  enfantId: string;
  prenom: string;
  couleur: string;
  /** null : présence non renseignée. */
  etat: EtatPastille | null;
  forme: FormeRepere;
  /** Marqueur visuel en plus de la couleur et de la forme. */
  marqueur: string;
  libelle: string;
}

export interface CelluleVue {
  date: DateJour;
  jour: number;
  dansMois: boolean;
  choisi: boolean;
  reperes: Repere[];
  /** Phrase complète pour les lecteurs d'écran. */
  libelle: string;
}

export interface DemandeVue {
  id: string;
  auteur: string;
  responsable: string;
  enfants: string[];
  jours: DateJour[];
}

export interface VuePlanning {
  titre: string;
  /** « AAAA-MM » des mois voisins. */
  precedent: string;
  suivant: string;
  semaines: CelluleVue[][];
  detail: { date: DateJour; enfants: EntreeAujourdhui[]; transferts: ProchainTransfert[] };
  demandesRecues: DemandeVue[];
  demandesEnvoyees: DemandeVue[];
}

export interface EntreePlanning {
  famille: Famille;
  adulteId: string;
  annee: number;
  mois: number;
  jourChoisi: DateJour;
  presences: Presence[];
  gardes: Garde[];
  transferts: Transfert[];
  demandes: DemandeEchange[];
}

const LIBELLES: Record<EtatPastille, string> = {
  "adulte-connecte": "chez vous",
  "autre-adulte": "chez l'autre adulte",
  tiers: "chez un tiers",
};
const FORMES: Record<EtatPastille, FormeRepere> = {
  "adulte-connecte": "plein",
  "autre-adulte": "contour",
  tiers: "tiers",
};
const MARQUEURS: Record<EtatPastille, string> = { "adulte-connecte": "✓", "autre-adulte": "•", tiers: "–" };

const jourLong = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00Z`),
  );

const p2 = (n: number) => String(n).padStart(2, "0");

/** Que montrer dans le planning pour tel adulte : fonction pure. */
export function choisirVuePlanning(e: EntreePlanning): VuePlanning {
  const { famille, adulteId } = e;
  const nom = (id: string) =>
    id === adulteId ? "vous" : (famille.adultes.find((a) => a.id === id)?.prenom ?? id);
  const prenomEnfant = (id: string) => famille.enfants.find((x) => x.id === id)?.prenom ?? id;

  const lieuParCle = new Map(e.presences.map((p) => [`${p.enfantId}|${p.date}`, p.lieuId]));

  const semaines = grilleMois(e.annee, e.mois).map((semaine) =>
    semaine.map((c): CelluleVue => {
      const reperes = famille.enfants.map((enfant): Repere => {
        const lieuId = lieuParCle.get(`${enfant.id}|${c.date}`);
        if (!lieuId) {
          return {
            enfantId: enfant.id,
            prenom: enfant.prenom,
            couleur: enfant.couleur,
            etat: null,
            forme: "inconnu",
            marqueur: "?",
            libelle: `${enfant.prenom}, non renseigné`,
          };
        }
        const etat = etatDuLieu(famille, adulteId, lieuId);
        return {
          enfantId: enfant.id,
          prenom: enfant.prenom,
          couleur: enfant.couleur,
          etat,
          forme: FORMES[etat],
          marqueur: MARQUEURS[etat],
          libelle: `${enfant.prenom}, ${LIBELLES[etat]}`,
        };
      });
      const renseignes = reperes.filter((r) => r.etat !== null);
      return {
        ...c,
        choisi: c.date === e.jourChoisi,
        reperes,
        libelle: `${jourLong(c.date)} : ${
          renseignes.length ? renseignes.map((r) => r.libelle).join(" ; ") : "aucune présence renseignée"
        }`,
      };
    }),
  );

  const detailVue = choisirVueAujourdhui({
    famille,
    adulteId,
    date: e.jourChoisi,
    gardes: e.gardes,
    presences: e.presences,
    transferts: [],
  });
  const transfertsDuJour = e.transferts
    .filter((t) => t.date === e.jourChoisi)
    .sort((a, b) => a.heure.localeCompare(b.heure))
    .map((t) => {
      const v = choisirVueAujourdhui({
        famille,
        adulteId,
        date: e.jourChoisi,
        gardes: [],
        presences: [],
        transferts: [t],
      });
      return v.prochainTransfert!;
    });

  const versVue = (d: DemandeEchange): DemandeVue => ({
    id: d.id,
    auteur: nom(d.auteurId),
    responsable: nom(d.responsableId),
    enfants: d.enfantIds.map(prenomEnfant),
    jours: [...d.jours].sort(),
  });
  const enAttente = e.demandes.filter((d) => d.statut === "proposee");

  const prec = moisAdjacent(e.annee, e.mois, -1);
  const suiv = moisAdjacent(e.annee, e.mois, 1);
  return {
    titre: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(e.annee, e.mois - 1, 15)),
    ),
    precedent: `${prec.annee}-${p2(prec.mois)}`,
    suivant: `${suiv.annee}-${p2(suiv.mois)}`,
    semaines,
    detail: { date: e.jourChoisi, enfants: detailVue.enfants, transferts: transfertsDuJour },
    demandesRecues: enAttente.filter((d) => d.auteurId !== adulteId).map(versVue),
    demandesEnvoyees: enAttente.filter((d) => d.auteurId === adulteId).map(versVue),
  };
}
