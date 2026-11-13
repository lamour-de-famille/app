# Avancement

Mise à jour : 2026-11-13

## État
Aucun arrêt en cours. Lot 1 (planning et agendas) : briques fusionnées dans `develop`, CI verte.

## Fait (lot 1)
- Socle : Next.js, TypeScript, vitest, ESLint, CI (secrets, lint, types, tests, build), Dockerfile Cloud Run, manifeste PWA (PR 1)
- Modèle de données : garde et présence distinctes, transferts, échanges, journal et événements à notifier, dépôt en mémoire durci (PR 4, 5)
- Moteur de règles paramétré en base : parité ISO, moitiés et quarts, point de départ du décompte, règles dérivées, créneaux marqués et déplaçables avec écart, application idempotente (PR 8)
- Outils rapides : dupliquer une semaine, appliquer un motif, échanger deux jours (PR 11, bibliothèque)
- Vacances scolaires : import du jeu ouvert (doublure et fixture, client HTTP non exécuté en test) (PR 10)
- Authentification Google avec liste d'adresses autorisées (doublure en test) (PR 2)
- Synchro Google Agenda via doublure : marque propre, idempotence, événements étrangers intacts, reprise après expiration (PR 7)
- Identité visuelle et briques d'interface (PR 3) ; écrans Aujourd'hui (PR 6) et Planning avec échange à accepter ou refuser (PR 9)
- Test d'acceptation de bout en bout (PR 12)

## Reste à faire
- Adaptateur Firestore (émulateur) derrière `DepotFamille` ; persistance de l'état de synchro
- Protéger les pages par la session (aujourd'hui, routes masquées en production), brancher l'adulte connecté
- Écrans pour les outils rapides et pour la saisie des règles ; déclenchement de la synchro
- Vérification manuelle du client HTTP réel (vacances, Agenda) hors test

## Cas d'arrêt à venir (hors périmètre des équipiers)
- Création du client OAuth Google, secrets, projet et déploiement Cloud Run : actions dans les comptes du propriétaire.

## Mise en production
Liste détaillée à compléter en fin de parcours.
