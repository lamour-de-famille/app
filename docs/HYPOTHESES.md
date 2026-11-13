# Hypothèses

Une ligne par décision prise sans réponse explicite : date, rôle, question, choix, raison.

- 2026-11-13 · coordinateur · Où mettre les agents ? · `.claude/agents/` dans le dépôt, sans donnée personnelle · demandé par le cadre de travail.
- 2026-11-13 · coordinateur · Jeton GitHub absent : que faire ? · préparer le socle en local et s'arrêter · cas d'arrêt « secret manquant ».
- 2026-11-13 · capitaine · Liste des adresses autorisées : base ou variable ? · variable d'environnement `ALLOWED_EMAILS` · plus simple, ADR 0002.
- 2026-11-13 · capitaine · Next.js sans `src/` plat ? · dossier `src/` avec alias `@/` · sépare code et configuration.
- 2026-11-13 · capitaine · `NODE_ENV=production` présent dans l'environnement : conséquence ? · `.npmrc` avec `include=dev` · sinon les outils de développement ne s'installent pas.
- 2026-11-13 · equipier-interface · Quelles couleurs pour les enfants fictifs ? · Léo bleu (tristesse), Mila rose (amour), Nina vert (calme) ; texte de pastille foncé ou blanc choisi selon le contraste · palette imposée, contraste testé.
- 2026-11-13 · equipier-interface · États de pastille sans couleur seule ? · plein + coche (rond), contour + point (rond), gris + tiret (carré arrondi pointillé), plus libellé accessible · ne pas dépendre de la couleur.
- 2026-11-13 · equipier-interface · Polices sans réseau au build ? · paquets `@fontsource-variable` (Inter, Bricolage Grotesque) importés dans le layout · pas de next/font/google.
- 2026-11-13 · equipier-donnees-regles · Sens d'une demande d'échange et nombre d'adultes ? · l'auteur demande qu'un adulte (`responsableId`) ait garde et nuit chez lui sur des jours donnés ; exactement deux adultes par famille · plus simple pour « l'autre adulte ».
- 2026-11-13 · equipier-interface · Écran Aujourd'hui sans authentification ni base réelle ? · adulte connecté = paramètre `?adulte=alex|sam`, dépôt de démonstration en mémoire, route masquée (404) en production, cases d'affaires dans `localStorage` · l'auth et Firestore arrivent par d'autres PR.
- 2026-11-13 · equipier-donnees-regles · Qui peut acquitter un événement et que vaut un id fourni ? · `marquerNotifie(destinataireId, evenementId)` refuse un autre adulte ; un id fourni remplace l'objet existant, un id généré saute les ids pris · évite acquittements croisés et écrasements silencieux.
