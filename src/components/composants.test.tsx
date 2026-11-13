import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Carte } from "./Carte";
import { Bouton } from "./Bouton";
import { PastilleEnfant, type EtatPastille } from "./PastilleEnfant";
import { BarreNavigation } from "./BarreNavigation";

describe("Carte", () => {
  it("affiche titre et contenu", () => {
    const html = renderToStaticMarkup(<Carte titre="Ce soir">Léo chez Alex</Carte>);
    expect(html).toContain("carte");
    expect(html).toContain("<h2>Ce soir</h2>");
    expect(html).toContain("Léo chez Alex");
  });
});

describe("Bouton", () => {
  it("rend un vrai button de type button", () => {
    const html = renderToStaticMarkup(<Bouton>Valider</Bouton>);
    expect(html).toBe('<button type="button" class="bouton">Valider</button>');
  });
  it("garde le type submit demandé", () => {
    expect(renderToStaticMarkup(<Bouton type="submit">Ok</Bouton>)).toContain('type="submit"');
  });
});

const pastille = (prenom: string, couleur: string, etat: EtatPastille) =>
  renderToStaticMarkup(<PastilleEnfant prenom={prenom} couleur={couleur} etat={etat} />);

describe("PastilleEnfant", () => {
  it("porte un libellé accessible différent par état", () => {
    expect(pastille("Mila", "#FF2E88", "adulte-connecte")).toContain('aria-label="Mila, chez vous"');
    expect(pastille("Mila", "#FF2E88", "autre-adulte")).toContain("chez l&#x27;autre adulte");
    expect(pastille("Mila", "#FF2E88", "tiers")).toContain('aria-label="Mila, chez un tiers"');
  });
  it("distingue les états par la forme et un marqueur, pas par la couleur seule", () => {
    const a = pastille("Léo", "#1E6BFF", "adulte-connecte");
    const b = pastille("Léo", "#1E6BFF", "autre-adulte");
    const c = pastille("Léo", "#1E6BFF", "tiers");
    expect(a).toContain("pastille--plein");
    expect(a).toContain("✓");
    expect(b).toContain("pastille--contour");
    expect(b).toContain("•");
    expect(c).toContain("pastille--tiers");
    expect(c).toContain("–");
  });
  it("applique la couleur de l'enfant", () => {
    expect(pastille("Nina", "#00B86B", "adulte-connecte")).toContain("background:#00B86B");
    expect(pastille("Nina", "#00B86B", "autre-adulte")).toContain("border-color:#00B86B");
  });
});

describe("BarreNavigation", () => {
  it("marque uniquement le lien actif avec aria-current", () => {
    const html = renderToStaticMarkup(<BarreNavigation chemin="/planning" />);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Navigation principale"');
    expect(html).toContain("Aujourd&#x27;hui");
    expect(html).toContain('href="/planning"');
  });
  it("n'en marque aucun hors des deux pages", () => {
    expect(renderToStaticMarkup(<BarreNavigation chemin="/autre" />)).not.toContain("aria-current");
  });
});
