import type { Repere } from "@/lib/vues/planning";

/**
 * Petit repère d'un enfant dans une case du calendrier : forme (rond plein, rond contour,
 * carré pointillé, tireté pour inconnu) + marqueur. Décoratif : le libellé de la case porte le sens.
 */
export function RepereEnfant({ repere }: { repere: Repere }) {
  const style =
    repere.forme === "plein"
      ? { background: repere.couleur, borderColor: repere.couleur }
      : repere.forme === "contour"
        ? { background: "#FFFFFF", borderColor: repere.couleur }
        : undefined;
  return (
    <span aria-hidden="true" className={`repere repere--${repere.forme}`} style={style}>
      {repere.marqueur}
    </span>
  );
}
