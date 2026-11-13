# Hypothèses

Une ligne par décision prise sans réponse explicite : date, rôle, question, choix, raison.

- 2026-11-13 · coordinateur · Où mettre les agents ? · `.claude/agents/` dans le dépôt, sans donnée personnelle · demandé par le cadre de travail.
- 2026-11-13 · coordinateur · Jeton GitHub absent : que faire ? · préparer le socle en local et s'arrêter · cas d'arrêt « secret manquant ».
- 2026-11-13 · capitaine · Liste des adresses autorisées : base ou variable ? · variable d'environnement `ALLOWED_EMAILS` · plus simple, ADR 0002.
- 2026-11-13 · capitaine · Next.js sans `src/` plat ? · dossier `src/` avec alias `@/` · sépare code et configuration.
- 2026-11-13 · capitaine · `NODE_ENV=production` présent dans l'environnement : conséquence ? · `.npmrc` avec `include=dev` · sinon les outils de développement ne s'installent pas.
- 2026-11-13 · equipier-integrations-google · Format de session ? · jeton maison `charge.signature` HMAC-SHA256 dans un cookie HttpOnly/Secure/SameSite=Lax, 7 jours, sans dépendance · simple, sans base.
- 2026-11-13 · equipier-integrations-google · Vérification du jeton d'identité Google ? · contrôle de `iss`, `aud`, `email_verified` sans revérifier la signature · jeton reçu directement de Google en TLS lors de l'échange du code.
- 2026-11-13 · equipier-integrations-google · URI de redirection ? · `APP_URL` + `/api/auth/callback`, repli sur l'origine de la requête si `APP_URL` est vide · fiable derrière un proxy ; à déclarer dans la console Google par le propriétaire.
- 2026-11-13 · equipier-integrations-google · `exigerSession` ? · relit `ALLOWED_EMAILS` à chaque appel et lève une `Response` 401 ; les pages redirigeront vers `/connexion` dans un lot ultérieur · garde ce lot minimal.
- 2026-11-13 · equipier-interface · Quelles couleurs pour les enfants fictifs ? · Léo bleu (tristesse), Mila rose (amour), Nina vert (calme) ; texte de pastille foncé ou blanc choisi selon le contraste · palette imposée, contraste testé.
- 2026-11-13 · equipier-interface · États de pastille sans couleur seule ? · plein + coche (rond), contour + point (rond), gris + tiret (carré arrondi pointillé), plus libellé accessible · ne pas dépendre de la couleur.
- 2026-11-13 · equipier-interface · Polices sans réseau au build ? · paquets `@fontsource-variable` (Inter, Bricolage Grotesque) importés dans le layout · pas de next/font/google.
- 2026-11-13 · equipier-donnees-regles · Sens d'une demande d'échange et nombre d'adultes ? · l'auteur demande qu'un adulte (`responsableId`) ait garde et nuit chez lui sur des jours donnés ; exactement deux adultes par famille · plus simple pour « l'autre adulte ».
- 2026-11-13 · equipier-integrations-google · Contenu et fuseau des événements d'agenda ? · nuits en journée entière par date et lieu, transferts de 30 min, créneaux à l'heure, fuseau Europe/Paris, les deux adultes voient tout · simple, modifiable dans `evenements.ts`.
- 2026-11-13 · equipier-interface · Écran Aujourd'hui sans authentification ni base réelle ? · adulte connecté = paramètre `?adulte=alex|sam`, dépôt de démonstration en mémoire, route masquée (404) en production, cases d'affaires dans `localStorage` · l'auth et Firestore arrivent par d'autres PR.
- 2026-11-13 · equipier-integrations-google · Cookies ? · préfixe `__Host-` (`__Host-session`, `__Host-etat_oauth`) · impose Secure/Path=/ côté navigateur.
- 2026-11-13 · equipier-donnees-regles · Qui peut acquitter un événement et que vaut un id fourni ? · `marquerNotifie(destinataireId, evenementId)` refuse un autre adulte ; un id fourni remplace l'objet existant, un id généré saute les ids pris · évite acquittements croisés et écrasements silencieux.
- 2026-11-13 · equipier-integrations-google · Dates de vacances et académie ? · jour civil de Paris de l'instant publié (22:00Z en hiver = lendemain), académie filtrée sur le brut mais absente de `PeriodeVacances` · type défini dans `src/lib/vacances/types.ts` faute de version dans `regles`.
- 2026-11-13 · equipier-donnees-regles · Moteur : fin de vacances, parité de semaine, créneaux supprimés à la main ? · `PeriodeVacances.fin` est le dernier jour inclus ; parité = semaine ISO du jour de début (semaine 53 puis 1 : deux impaires de suite) ; un créneau généré supprimé à la main est recréé à la prochaine application (seul un déplacement est mémorisé) · pas de pierre tombale pour l'instant, voir ADR 0005.
- 2026-11-13 · equipier-donnees-regles · Gardes et présences périmées après changement de règle ? · marque `origine: "regle"` sur Garde et Presence ; l'application retire dans le mois celles marquées non voulues et laisse les saisies sans marque (échanges acceptés compris) · voir ADR 0005.
