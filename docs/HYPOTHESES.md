# Hypothèses

Une ligne par décision prise sans réponse explicite : date, rôle, question, choix, raison.

- 2026-11-13 · coordinateur · Où mettre les agents ? · `.claude/agents/` dans le dépôt, sans donnée personnelle · demandé par le cadre de travail.
- 2026-11-13 · coordinateur · Jeton GitHub absent : que faire ? · préparer le socle en local et s'arrêter · cas d'arrêt « secret manquant ».
- 2026-11-13 · capitaine · Liste des adresses autorisées : base ou variable ? · variable d'environnement `ALLOWED_EMAILS` · plus simple, ADR 0002.
- 2026-11-13 · capitaine · Next.js sans `src/` plat ? · dossier `src/` avec alias `@/` · sépare code et configuration.
- 2026-11-13 · capitaine · `NODE_ENV=production` présent dans l'environnement : conséquence ? · `.npmrc` avec `include=dev` · sinon les outils de développement ne s'installent pas.
- 2026-11-13 · equipier-integrations-google · Format de session ? · jeton maison `charge.signature` HMAC-SHA256 dans un cookie HttpOnly/Secure/SameSite=Lax, 7 jours, sans dépendance · simple, sans base.
- 2026-11-13 · equipier-integrations-google · Vérification du jeton d'identité Google ? · contrôle de `iss`, `aud`, `email_verified` sans revérifier la signature · jeton reçu directement de Google en TLS lors de l'échange du code.
- 2026-11-13 · equipier-integrations-google · URI de redirection ? · déduite de l'origine de la requête (`/api/auth/callback`) · à confirmer derrière un proxy ; à déclarer dans la console Google par le propriétaire.
- 2026-11-13 · equipier-integrations-google · `exigerSession` ? · lève une `Response` 401 ; les pages redirigeront vers `/connexion` dans un lot ultérieur · garde ce lot minimal.
