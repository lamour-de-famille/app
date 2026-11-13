# Hypothèses

Une ligne par décision prise sans réponse explicite : date, rôle, question, choix, raison.

- 2026-11-13 · coordinateur · Où mettre les agents ? · `.claude/agents/` dans le dépôt, sans donnée personnelle · demandé par le cadre de travail.
- 2026-11-13 · coordinateur · Jeton GitHub absent : que faire ? · préparer le socle en local et s'arrêter · cas d'arrêt « secret manquant ».
- 2026-11-13 · capitaine · Liste des adresses autorisées : base ou variable ? · variable d'environnement `ALLOWED_EMAILS` · plus simple, ADR 0002.
- 2026-11-13 · capitaine · Next.js sans `src/` plat ? · dossier `src/` avec alias `@/` · sépare code et configuration.
- 2026-11-13 · capitaine · `NODE_ENV=production` présent dans l'environnement : conséquence ? · `.npmrc` avec `include=dev` · sinon les outils de développement ne s'installent pas.
- 2026-11-13 · equipier-donnees-regles · Sens d'une demande d'échange et nombre d'adultes ? · l'auteur demande qu'un adulte (`responsableId`) ait garde et nuit chez lui sur des jours donnés ; exactement deux adultes par famille · plus simple pour « l'autre adulte ».
