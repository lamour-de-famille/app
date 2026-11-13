import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "principal" | "secondaire" };

/** Vrai bouton : cible minimale 44 px et focus visible assurés par la feuille de style. */
export function Bouton({ variante = "principal", type = "button", className, ...reste }: Props) {
  const classes = ["bouton", variante === "secondaire" ? "bouton--secondaire" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...reste} />;
}
