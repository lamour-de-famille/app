import type { Repere } from "@/lib/vues/planning";

/**
 * Petit repère d'un enfant dans une case du calendrier : forme (rond plein, rond contour,
 * carré gris à bord tireté pour un tiers, carré blanc à bord pointillé si non renseigné). Le marqueur
 * n'est lisible que dans la légende (trop petit dans la grille). Décoratif : le libellé de la case porte le sens.
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
