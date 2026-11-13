# ADR 0009 — Persistance Firestore

Statut : accepté (2026-11-14)

## Décisions

- **SDK** : `@google-cloud/firestore`, derrière une fine interface `Banque` (documents JSON par collection, tout en transaction). Deux implémentations : `BanqueFirestore` (SDK) et `BanqueMemoire` (double de test, transactions sérialisées, écritures tout ou rien).
- **Chemins** : `familles/{familleId}` (la famille) puis `familles/{familleId}/{gardes|presences|transferts|creneaux|demandes|regles|journal|evenements|etatsSynchro}/{id}`. Les clés des gardes et présences sont « enfant|date ».
- **Même comportement que le dépôt mémoire, par construction** : `DepotFirestore` ne réécrit aucune règle. Chaque opération charge, dans une transaction, les collections utiles dans un `DepotMemoire` (`restaurerEtat`), exécute l'opération, puis écrit seulement les documents modifiés, le journal et les événements (`exporterEtat`). Une opération rejetée n'écrit rien ; deux écritures concurrentes se rejouent (transaction).
- **Ids** : générés uniques et triables par date de création (`genererId` injectable dans `DepotMemoire`), pour que le journal relu soit dans l'ordre des écritures.
- **Ordre des listes** : gardes, présences, transferts, créneaux, demandes et règles sont retournés triés par clé (id, ou « enfant|date »), en comparant les unités de code (`<`, jamais `localeCompare`), dans le dépôt mémoire comme dans Firestore ; l'ordre ne dépend donc ni de l'ordre d'insertion ni de `Object.entries` (qui place les clés entières en tête). Le journal et les événements restent chronologiques, grâce aux ids « jn-… » et « ev-… » triables par date. La suite contrat le vérifie, ids numériques compris.
- **Lectures et création** : les lectures pures s'exécutent en transaction `readOnly` (aucune écriture possible). `initialiserFamille` ne fait que créer et refuse d'écraser une famille existante. `familleId` est validé (`idDocumentValide`) à la construction du dépôt et du stockage d'état.
- **Suite contrat** : `src/lib/domaine/depot-contrat.ts` est exécutée contre le dépôt mémoire, `DepotFirestore` sur banque mémoire et `DepotFirestore` sur l'émulateur. Même principe pour `StockageEtatSynchro` (mémoire, Firestore sur banque mémoire, émulateur).
- **Émulateur** : tests actifs seulement si `FIRESTORE_EMULATOR_HOST` est défini (sinon ignorés). `npm run test:emulateur` lance `firebase emulators:exec` (Java 21) ; job CI dédié `emulateur-firestore`.
- **État de synchro Agenda** : `StockageEtatFirestore`, un document par adulte sous `etatsSynchro`.

## Conséquences

- Chaque opération relit les collections concernées en entier : acceptable à l'échelle d'une famille, mais le journal et les gardes grossissent. Premières optimisations possibles : requêtes par période, index, archivage du journal.
- Une valeur `undefined` n'existe pas dans Firestore : elle est retirée à l'écriture (par exemple `apres` d'une suppression est absent plutôt que `undefined`).
- Règles de sécurité Firestore et authentification serveur à définir avant le branchement des pages ; les accès passent par le serveur.
- Plusieurs instances (processus) écrivant dans la même famille : l'horloge du journal est celle de chaque instance. Les ids du journal sont triés par heure locale de création ; un décalage d'horloge entre instances peut inverser l'ordre de deux écritures quasi simultanées. Acceptable à l'échelle d'une famille ; un horodatage serveur serait la correction.
