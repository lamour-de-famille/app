import type { EtatPastille } from "@/components/PastilleEnfant";
import type { DateJour, Famille, Garde, Heure, Presence, Transfert } from "@/lib/domaine/types";
import { AFFAIRES_FICTIVES } from "./affaires";

export interface EntreeAujourdhui {
  enfantId: string;
  prenom: string;
  couleur: string;
  etat: EtatPastille;
  /** Où l'enfant dort ce soir (présence) ; null si inconnu. */
  lieu: string | null;
  /** Qui est responsable (garde) : « vous », un prénom, ou null si inconnu. */
  garde: string | null;
  /** Vrai si garde et présence ne coïncident pas : les deux sont alors affichées. */
  divergence: boolean;
}

export interface ProchainTransfert {
  id: string;
  date: DateJour;
  heure: Heure;
  lieu: string;
  depose: string;
  recupere: string;
  enfants: string[];
  aujourdhui: boolean;
}

export interface Affaire {
  /** Clé stable `transfert|enfant|rang`, utilisée pour conserver la case cochée. */
  cle: string;
  enfant: string;
  libelle: string;
}

export interface VueAujourdhui {
  date: DateJour;
  enfants: EntreeAujourdhui[];
  prochainTransfert: ProchainTransfert | null;
  affaires: Affaire[];
}

export interface EntreeVue {
  famille: Famille;
  adulteId: string;
  date: DateJour;
  gardes: Garde[];
  presences: Presence[];
  transferts: Transfert[];
  affairesParEnfant?: Record<string, string[]>;
}

/** Que montrer aujourd'hui pour tel adulte : fonction pure, sans accès aux données. */
export function choisirVueAujourdhui(e: EntreeVue): VueAujourdhui {
  const { famille, adulteId, date } = e;
  const index = famille.adultes.findIndex((a) => a.id === adulteId);
  if (index < 0) throw new Error(`Adulte inconnu : ${adulteId}`);
  const moi = famille.adultes[index]!;
  const typeMoi = index === 0 ? "domicile_a" : "domicile_b";
  const typeAutre = index === 0 ? "domicile_b" : "domicile_a";
  const nomAdulte = (id: string) => (id === moi.id ? "vous" : (famille.adultes.find((a) => a.id === id)?.prenom ?? id));
  const lieuDe = (id: string) => famille.lieux.find((l) => l.id === id);

  const enfants = famille.enfants.map((enfant): EntreeAujourdhui => {
    const g = e.gardes.find((x) => x.enfantId === enfant.id && x.date === date);
    const p = e.presences.find((x) => x.enfantId === enfant.id && x.date === date);
    const lieu = p ? lieuDe(p.lieuId) : undefined;
    const etat: EtatPastille =
      lieu?.type === typeMoi ? "adulte-connecte" : lieu?.type === typeAutre ? "autre-adulte" : "tiers";
    // Le responsable est « chez lui » s'il dort à son propre domicile.
    const domicileResponsable = g ? (g.responsableId === moi.id ? typeMoi : typeAutre) : null;
    const divergence = Boolean(g && lieu && lieu.type !== domicileResponsable);
    return {
      enfantId: enfant.id,
      prenom: enfant.prenom,
      couleur: enfant.couleur,
      etat,
      lieu: lieu?.libelle ?? null,
      garde: g ? nomAdulte(g.responsableId) : null,
      divergence,
    };
  });

  const prochain = e.transferts
    .filter((t) => t.date >= date)
    .sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure))[0];

  const prochainTransfert: ProchainTransfert | null = prochain
    ? {
        id: prochain.id,
        date: prochain.date,
        heure: prochain.heure,
        lieu: lieuDe(prochain.lieuId)?.libelle ?? "Lieu à préciser",
        depose: nomAdulte(prochain.deposeId),
        recupere: nomAdulte(prochain.recupereId),
        enfants: prochain.enfantIds.map((id) => famille.enfants.find((x) => x.id === id)?.prenom ?? id),
        aujourdhui: prochain.date === date,
      }
    : null;

  const liste = e.affairesParEnfant ?? AFFAIRES_FICTIVES;
  const affaires: Affaire[] = prochain
    ? prochain.enfantIds.flatMap((id) => {
        const prenom = famille.enfants.find((x) => x.id === id)?.prenom ?? id;
        return (liste[id] ?? []).map((libelle, rang) => ({
          cle: `${prochain.id}|${id}|${rang}`,
          enfant: prenom,
          libelle,
        }));
      })
    : [];

  return { date, enfants, prochainTransfert, affaires };
}
