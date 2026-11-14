import { createHash } from "node:crypto";
import type { TacheGoogle, TacheSouhaitee } from "./types";

/**
 * Google Tasks n'a pas de propriétés privées : la marque et la clé stable sont encodées dans la DERNIÈRE ligne
 * du champ `notes`, sous un préfixe reconnaissable :
 *   [lamour-de-famille v1 cle=<cle> emp=<empreinte>]
 * Une tâche n'est « à nous » que si cette ligne, exactement de cette forme, termine ses notes.
 */
const MARQUE = /^\[lamour-de-famille v1 cle=(\S+) emp=([0-9a-f]{16})\]$/;

export interface MarqueLue {
  cle: string;
  empreinte: string;
}

/** Empreinte du contenu voulu : change si et seulement si la tâche doit être mise à jour. */
export function empreinte(t: TacheSouhaitee): string {
  return createHash("sha256")
    .update(JSON.stringify([t.titre, t.notes ?? "", t.echeance ?? ""]))
    .digest("hex")
    .slice(0, 16);
}

export function encoderNotes(t: TacheSouhaitee): string {
  const ligne = `[lamour-de-famille v1 cle=${t.cle} emp=${empreinte(t)}]`;
  return t.notes ? `${t.notes}\n\n${ligne}` : ligne;
}

export function lireMarque(notes: string): MarqueLue | undefined {
  const derniere = notes.trimEnd().split("\n").pop()?.trim() ?? "";
  const m = MARQUE.exec(derniere);
  return m ? { cle: m[1]!, empreinte: m[2]! } : undefined;
}

export const estMarquee = (t: TacheGoogle): boolean => lireMarque(t.notes) !== undefined;
