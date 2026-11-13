import { ErreurDomaine } from "../domaine/depot";
import type { Famille } from "../domaine/types";
import type { InstantHebdo, Regle } from "./types";

const RE_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PARITES = ["paire", "impaire"];

function refuser(regle: { id?: unknown }, message: string): never {
  throw new ErreurDomaine(`Règle ${String(regle.id)} invalide : ${message}`);
}

/** Valide la forme d'une règle et ses références à la famille (adultes, enfants, lieux). */
export function validerRegle(regle: Regle, famille: Famille): void {
  if (typeof regle.id !== "string" || !/^[\w-]+$/.test(regle.id)) refuser(regle, "id attendu (lettres, chiffres, - et _)");
  if (typeof regle.libelle !== "string" || regle.libelle.trim() === "") refuser(regle, "libellé vide");
  if (typeof regle.actif !== "boolean") refuser(regle, "`actif` doit être booléen");
  if (!Number.isInteger(regle.priorite)) refuser(regle, "priorité entière attendue");
  if (regle.lieuTransfertId !== undefined && !famille.lieux.some((l) => l.id === regle.lieuTransfertId)) {
    refuser(regle, `lieu inconnu ${regle.lieuTransfertId}`);
  }
  const adulte = (id: string) => {
    if (!famille.adultes.some((a) => a.id === id)) refuser(regle, `adulte inconnu ${id}`);
  };
  const enfants = (ids: string[]) => {
    if (!Array.isArray(ids) || ids.length === 0) refuser(regle, "au moins un enfant");
    if (new Set(ids).size !== ids.length) refuser(regle, "enfant en double");
    for (const id of ids) if (!famille.enfants.some((e) => e.id === id)) refuser(regle, `enfant inconnu ${id}`);
  };
  const instant = (i: InstantHebdo) => {
    if (!Number.isInteger(i?.jour) || i.jour < 1 || i.jour > 7) refuser(regle, "jour ISO entre 1 et 7");
    if (!RE_HEURE.test(i.heure)) refuser(regle, `heure invalide ${i.heure}`);
  };

  switch (regle.type) {
    case "week_end":
      if (!PARITES.includes(regle.parite)) refuser(regle, "parité inconnue");
      adulte(regle.responsableId);
      enfants(regle.enfantIds);
      instant(regle.debut);
      instant(regle.fin);
      return;
    case "vacances":
      if (typeof regle.nomContient !== "string" || regle.nomContient.trim() === "") refuser(regle, "nom de période vide");
      if (!Number.isInteger(regle.parts) || regle.parts < 1 || regle.parts > 12) refuser(regle, "parts entre 1 et 12");
      for (const parite of PARITES as Array<"paire" | "impaire">) {
        const liste = regle.attributions?.[parite];
        if (!Array.isArray(liste) || liste.length !== regle.parts) {
          refuser(regle, `attributions ${parite} : ${regle.parts} responsable(s) attendu(s)`);
        }
        liste.forEach(adulte);
      }
      enfants(regle.enfantIds);
      if (regle.departDecompte !== "jour_officiel" && regle.departDecompte !== "lendemain") {
        refuser(regle, "départ du décompte inconnu");
      }
      if (!RE_HEURE.test(regle.heureChangement)) refuser(regle, "heure de changement invalide");
      if (regle.anneeReference !== "debut" && regle.anneeReference !== "fin") refuser(regle, "année de référence inconnue");
      return;
    case "derivee":
      if (regle.sourceId === regle.id) refuser(regle, "une règle ne peut pas se suivre elle-même");
      adulte(regle.suitAdulteId);
      enfants(regle.enfantIds);
      return;
    default:
      refuser(regle, "type inconnu");
  }
}
