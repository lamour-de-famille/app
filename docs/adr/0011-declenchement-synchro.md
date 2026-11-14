# ADR 0011 — Déclenchement de la synchro Agenda

Statut : accepté (2026-11-14). La numérotation ne saute pas : 0009 (Firestore), 0010 (pages protégées) et 0012 (Gemini) sont les ADR des autres chantiers, 0011 est le suivant libre pour celui-ci.

## Décisions

- **Service** : `declencherSynchroAgenda({ depot, clients, stockage })` (`src/lib/agenda/declenchement.ts`) lit tout le dépôt (famille, présences, transferts, créneaux), calcule `evenementsSouhaites` puis appelle `synchroniserFamille`. Pas de fenêtre de dates : la synchro supprime ce qui n'est plus voulu, une fenêtre ferait disparaître le passé de l'agenda.
- **Verrou par processus** : une synchro à la fois ; toute demande reçue pendant l'exécution est regroupée en une seule relance (paramètres les plus récents). Le verrou est libéré même en cas d'erreur. Il ne protège pas entre instances : l'idempotence de l'ADR 0006 rend deux passages concurrents sans danger (au pire un doublon marqué, nettoyé au passage suivant).
- **Clients injectés** : une fabrique `(adulteIds) => clients par adulte`. Aujourd'hui elle renvoie `{}` : chaque adulte est « a_reconnecter ». Elle sera branchée sur les jetons stockés plus tard. Dépôt et stockage d'état sont injectés : par défaut le dépôt vient du point unique d'accès (`obtenirDepot`, banque Firestore unique, jour de Paris) et l'état est stocké par `StockageEtatFirestore` ; en démonstration et en test, dépôt de démonstration et état en mémoire.
- **Secret** : `SYNCHRO_SECRET` de moins de 32 caractères est refusé (comme `SESSION_SECRET`).
- **Route** `POST /api/synchro/agenda` : autorisée par `Authorization: Bearer ${SYNCHRO_SECRET}` (comparaison à temps constant sur empreintes ; variable vide = secret refusé) ou, sans en-tête, par une session d'adulte dont l'adresse est dans `ALLOWED_EMAILS`. 401 si identifiants absents ou invalides, 403 si session valide mais adresse non autorisée. La réponse ne contient que statuts et compteurs, jamais de secret ni de message d'erreur détaillé.
- **Après écriture** : `synchroApresModification()` est appelée sans `await` par les actions serveur. Elle ne lève jamais ; l'échec est journalisé par le seul nom de l'erreur. Les actions de planning lui passent le dépôt déjà obtenu par la garde.

## Configuration Cloud Scheduler attendue

- Cible HTTP, méthode `POST`, URL `https://<domaine-de-l-application>/api/synchro/agenda`, corps vide.
- En-tête `Authorization: Bearer <valeur de SYNCHRO_SECRET>`, la valeur étant lue depuis le gestionnaire de secrets, jamais écrite dans la définition versionnée.
- Fréquence indicative : toutes les 15 minutes (filet de sécurité en plus du déclenchement après écriture) ; fuseau `Europe/Paris`.
- Nouvelles tentatives : 1 à 3, avec attente exponentielle ; délai d'expiration de 60 s. Une réponse 401/403 n'est pas à réessayer.
- `SYNCHRO_SECRET` : aléatoire, 32 caractères minimum, renouvelable sans interruption (changer la variable puis la tâche).

## Conséquences

Sur un hébergement serverless, une tâche lancée sans `await` après la réponse peut être interrompue : le passage périodique du Scheduler la rattrape. Le stockage des jetons reste à brancher.
