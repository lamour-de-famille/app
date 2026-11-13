import { texteSur } from "@/lib/contraste";

/** Couleurs fictives par enfant, choisies parmi la palette d'émotions. */
export const COULEURS_ENFANTS: Record<string, string> = {
  Léo: "#1E6BFF",
  Mila: "#FF2E88",
  Nina: "#00B86B",
};

export type EtatPastille = "adulte-connecte" | "autre-adulte" | "tiers";

const LIBELLES: Record<EtatPastille, string> = {
  "adulte-connecte": "chez vous",
  "autre-adulte": "chez l'autre adulte",
  tiers: "chez un tiers",
};

/** Marqueur de forme en plus de la couleur : coche, point, tiret. */
const MARQUEURS: Record<EtatPastille, string> = {
  "adulte-connecte": "✓",
  "autre-adulte": "•",
  tiers: "–",
};

const GRIS = "#E3E1E8";
const TEXTE = "#1D1B26";

export function PastilleEnfant({
  prenom,
  couleur,
  etat,
}: {
  prenom: string;
  couleur: string;
  etat: EtatPastille;
}) {
  const style =
    etat === "adulte-connecte"
      ? { background: couleur, color: texteSur(couleur), borderColor: couleur }
      : etat === "autre-adulte"
        ? { background: "#FFFFFF", color: TEXTE, borderColor: couleur }
        : { background: GRIS, color: TEXTE, borderColor: "#6B6878" };
  const forme = etat === "adulte-connecte" ? "plein" : etat === "autre-adulte" ? "contour" : "tiers";
  return (
    <span
      role="img"
      aria-label={`${prenom}, ${LIBELLES[etat]}`}
      className={`pastille pastille--${forme}`}
      style={style}
    >
      <span aria-hidden="true">
        {prenom.charAt(0).toUpperCase()}
        {MARQUEURS[etat]}
      </span>
    </span>
  );
}
