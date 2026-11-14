# ADR 0015 — Synchronisation Google Tasks

Statut : accepté (2026-11-14)

Calquée sur l'ADR 0006 (Agenda) ; code dans `src/lib/tasks/`.

## Décisions

- **Une liste dédiée par adulte** (« L'amour de famille », trouvée par son titre, créée au besoin), avec l'autorisation de cet adulte. Le client d'un adulte n'est jamais utilisé pour l'autre. Interface `ClientTasks` (`idListe`, `lister`, `creer`, `mettreAJour`, `supprimer`), doublure `TasksFactice`, HTTP réel `ClientTasksGoogle` (testé avec un faux `fetch` seulement).
- **Confidentialité** : la liste d'un adulte ne reçoit que les tâches dont il est l'assigné (son retard compris, jamais celui de l'autre ni les tâches de l'autre, même à venir). Le filtre `assigneId` est posé avant le développement des occurrences, puis revérifié. Une réassignation déplace la tâche (supprimée d'une liste, créée dans l'autre). Tests dans les deux sens.
- **Marque dans `notes`** : Google Tasks n'a pas de propriétés privées. La dernière ligne des notes est `[lamour-de-famille v1 cle=<cle> emp=<empreinte>]`. Une tâche n'est « à nous » que si cette ligne exacte termine ses notes ; sinon elle est étrangère et jamais modifiée ni supprimée. Limite assumée : l'adulte peut effacer ou abîmer cette ligne en éditant les notes (la tâche devient alors étrangère, et une nouvelle est créée au passage suivant).
- **Idempotence sans table de correspondance** : la liste est la source de vérité. On lit tout (cochées comprises), on garde les tâches marquées, puis création (clé absente), mise à jour (empreinte différente), suppression (clé plus voulue ou doublon d'une coupure). La clé est `cleOccurrence` (`<tacheId>@<date>`) ; changer l'échéance change donc la clé (suppression puis création).
- **Fenêtre** : `a_faire` seulement ; retard de l'assigné (séries : 60 jours, comme la vue de l'application ; ponctuelles : sans limite), prochains 14 jours, tâches sans échéance. Réglable (`joursAvenir`, `joursRattrapage`). L'échéance est la date seule (`due` à minuit UTC).
- **Coche dans Google Tasks : ignorée** (sens unique application vers Google). Raisons : l'écriture inverse ouvrirait un chemin d'écriture vers la base depuis un service externe ; une tâche décochée dans l'application resterait ambiguë (coche Google ancienne ou récente ?) ; la mise à jour utilise PATCH sans `status`, donc ne décoche jamais. Une tâche cochée dans Google n'est ni recréée ni modifiée tant qu'elle est voulue ; quand elle est faite ou supprimée dans l'application, elle est retirée de la liste.
- **État et expiration** : même modèle que l'Agenda (`EtatSynchro`, `StockageEtatSynchro`), avec une instance de stockage distincte. Autorisation expirée (401, `invalid_grant`, `ErreurAutorisationExpiree`) : passage interrompu, état `a_reconnecter`, dernier succès et compte conservés, rien supprimé ; adulte sans client : `a_reconnecter`.
- **Entrée du déclencheur** : `synchroniserTasksFamille({ depot, famille, clients, titreListe?, joursAvenir?, joursRattrapage? }, stockage, maintenant?)` ; ne lève pas pour une erreur attendue. Le jour courant vient de `depot.aujourdhui()`.

## Conséquences

Une même liste peut être éditée à la main : seules les tâches marquées sont gérées. Un titre modifié à la main dans Google n'est pas corrigé tant que le contenu voulu ne change pas. Deux listes portant le même titre : la première est utilisée. Branchement du stockage des jetons et du déclencheur à faire séparément.
