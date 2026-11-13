/** Calcul du rapport de contraste WCAG entre deux couleurs hexadécimales. */

function canal(hex: string, debut: number): number {
  const v = parseInt(hex.slice(debut, debut + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function normaliser(hex: string): string {
  const h = hex.trim().replace(/^#/, "");
  const complet = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(complet)) throw new Error(`Couleur invalide : ${hex}`);
  return complet;
}

export function luminance(hex: string): number {
  const h = normaliser(hex);
  return 0.2126 * canal(h, 0) + 0.7152 * canal(h, 2) + 0.0722 * canal(h, 4);
}

/** Rapport de contraste entre 1 et 21. */
export function contraste(hexA: string, hexB: string): number {
  const a = luminance(hexA);
  const b = luminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const SEUIL_TEXTE = 4.5;

/** Choisit, entre le texte foncé et le blanc, la couleur la plus lisible sur `fond`. */
export function texteSur(fond: string, sombre = "#1D1B26", clair = "#FFFFFF"): string {
  return contraste(fond, sombre) >= contraste(fond, clair) ? sombre : clair;
}
