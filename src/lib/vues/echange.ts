import type { NouvelleDemande } from "@/lib/domaine/depot";
import type { Famille } from "@/lib/domaine/types";
import { joursEntre, MAX_JOURS_DEMANDE } from "./mois";

export type ResultatDemande = { ok: true; demande: NouvelleDemande } | { ok: false; message: string };

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
  if (!moi) return { ok: false, message: "Adulte inconnu." };
  const autre = famille.adultes.find((a) => a.id !== adulteId)!;
  if (!e.du) return { ok: false, message: "Indiquez le premier jour." };
  if (e.enfantIds.length === 0) return { ok: false, message: "Choisissez au moins un enfant." };
  if (e.enfantIds.some((id) => !famille.enfants.some((x) => x.id === id))) {
    return { ok: false, message: "Enfant inconnu." };
  }
  if (e.garde !== "moi" && e.garde !== "autre") return { ok: false, message: "Indiquez qui aura la garde." };
  let jours: string[];
  try {
    jours = joursEntre(e.du, e.au || e.du);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.startsWith("Plus de")) return { ok: false, message: `Une demande couvre au plus ${MAX_JOURS_DEMANDE} jours.` };
    if (msg.includes("précède")) return { ok: false, message: "Le dernier jour doit suivre le premier." };
    return { ok: false, message: "Dates invalides." };
  }
  return {
    ok: true,
    demande: { responsableId: e.garde === "moi" ? moi.id : autre.id, enfantIds: e.enfantIds, jours },
  };
}
