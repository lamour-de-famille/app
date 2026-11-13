import type { NouvelleDemande } from "@/lib/domaine/depot";
import type { Famille } from "@/lib/domaine/types";
import { joursEntre, MAX_JOURS_DEMANDE } from "./mois";

export type ResultatDemande = { ok: true; demande: NouvelleDemande } | { ok: false; code: string; message: string };

/** Valide le formulaire « Proposer un échange » : pure, messages en français. */
export function construireDemande(e: {
  famille: Famille;
  adulteId: string;
  du: string;
  au: string;
  enfantIds: string[];
  /** « moi » : la garde chez l'adulte connecté ; « autre » : chez l'autre adulte. */
  garde: string;
}): ResultatDemande {
  const { famille, adulteId } = e;
  const moi = famille.adultes.find((a) => a.id === adulteId);
  if (!moi) return { ok: false, code: "invalide", message: "Adulte inconnu." };
  const autre = famille.adultes.find((a) => a.id !== adulteId)!;
  if (!e.du) return { ok: false, code: "invalide-jour", message: "Indiquez le premier jour." };
  const enfantIds = [...new Set(e.enfantIds)];
  if (enfantIds.length === 0) return { ok: false, code: "invalide-enfants", message: "Choisissez au moins un enfant." };
  if (enfantIds.some((id) => !famille.enfants.some((x) => x.id === id))) {
    return { ok: false, code: "invalide-enfants", message: "Enfant inconnu." };
  }
  if (e.garde !== "moi" && e.garde !== "autre") return { ok: false, code: "invalide-garde", message: "Indiquez qui aura la garde." };
  let jours: string[];
  try {
    jours = joursEntre(e.du, e.au || e.du);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("Plus de")) return { ok: false, code: "invalide-duree", message: `Une demande couvre au plus ${MAX_JOURS_DEMANDE} jours.` };
    if (msg.includes("précède")) return { ok: false, code: "invalide-ordre", message: "Le dernier jour doit suivre le premier." };
    return { ok: false, code: "invalide-dates", message: "Dates invalides." };
  }
  return {
    ok: true,
    demande: { responsableId: e.garde === "moi" ? moi.id : autre.id, enfantIds, jours },
  };
}
