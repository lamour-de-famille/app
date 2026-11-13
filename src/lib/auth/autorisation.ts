/** Lit `ALLOWED_EMAILS` (séparées par des virgules), normalisées en minuscules. */
export function listeAutorisee(brut: string | undefined = process.env.ALLOWED_EMAILS): string[] {
  return (brut ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** Insensible à la casse ; liste vide = tout refuser. */
export function estAutorise(email: string, liste: string[] = listeAutorisee()): boolean {
  return liste.includes(email.trim().toLowerCase());
}
