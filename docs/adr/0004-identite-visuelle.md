# ADR 0004 — Identité visuelle et briques d'interface

Statut : accepté (2026-11-13)

- Fond rose pâle en dégradé doux ; cartes blanches au rayon de 24 px ; texte `#1D1B26`, secondaire `#4A4757`.
- Polices Bricolage Grotesque (titres) et Inter (corps), auto-hébergées via `@fontsource-variable/*` : aucun appel réseau au build.
- Six couleurs d'émotions (joie, calme, tristesse, colère, peur, amour) en jetons CSS. La transparence passe par le canal alpha ; `mix-blend-mode: multiply` est interdit (rendu imprévisible, contraste non mesurable).
- Accessibilité : contraste >= 4,5:1 vérifié par `contraste()` en test (texte sur blanc, sur les deux extrémités du fond, texte de pastille) ; cibles >= 44 px ; focus visible ; la couleur n'est jamais seule porteuse de sens (forme, marqueur et libellé accessible sur les pastilles).
- Les couleurs d'émotions servent de fonds ou de contours, pas de texte sur blanc (certaines sont sous 4,5:1).
- Navigation basse à deux entrées (Aujourd'hui, Planning), lien actif signalé par `aria-current="page"` et par un style non coloré (gras, souligné). `/` redirige vers `/aujourdhui`.
