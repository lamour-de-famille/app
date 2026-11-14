# ADR 0013 — Tâches (domaine)

Statut : accepté (2026-11-14)

## Décisions

- Code dans `src/lib/taches/`, interface **`DepotTaches`** séparée de `DepotFamille` (celle-ci est en cours d'adaptation Firestore) ; implémentation `DepotTachesMemoire`. Un adaptateur Firestore viendra plus tard.
- `Tache` : titre, assigné (adulte), échéance et enfant optionnels, statut, créateur, `faiteLe`. La récurrence est une donnée (`frequence` quotidienne / hebdomadaire / mensuelle, `intervalle` >= 1, `fin` optionnelle) ; l'échéance est l'ancre et est obligatoire pour une série. Mensuelle : même quantième, ramené au dernier jour du mois s'il n'existe pas.
- **Occurrences** : `developperOccurrences(tache, du, au)`. Cocher une occurrence d'une série enregistre une exception `{date, faiteLe}` ; le reste de la série n'est pas touché. Modifier la série écarte les exceptions qui ne correspondent plus à une date de la série.
- **Clé stable pour Google Tasks** : `cle = "<tacheId>@<AAAA-MM-JJ>"` (ou `@sans-date`). Une occurrence garde sa clé tant que la tâche existe et que la date reste dans la série.
- Validation à l'écriture : auteur et assigné adultes de la famille, enfant existant, dates réelles, intervalle entier >= 1, fin >= ancre.

## Visibilité : l'à venir est partagé, le retard est privé

`tachesPourAdulte(depot, famille, adulteId)` est la seule lecture destinée à un écran ; `adulteId` (le demandeur) décide, côté serveur :

| Tâche | Assignée au demandeur | Assignée à l'autre |
|---|---|---|
| Échéance aujourd'hui | `aujourdhui` | `aujourdhui`, `deLAutre: true` |
| Après aujourd'hui, jusqu'au dimanche ISO | `cetteSemaine` | idem, `deLAutre: true` |
| Échéance passée, non faite | `aRattraper` | **jamais montrée**, nulle part |
| Sans échéance, non faite | `sansEcheance` | idem, `deLAutre: true` |

Le retard de l'autre n'est pas calculé (la fenêtre de l'autre commence à aujourd'hui), n'est dans aucune section et n'est dans aucun compte : `compte` est dérivé des sections filtrées. Un filtre final redondant garantit que `aRattraper` ne contient que des tâches du demandeur. Tests explicites dans les deux sens.

`DepotTaches.lister()` reste un accès brut pour la couche serveur ; il ne doit jamais être exposé à un client.

## Règle d'écriture

- **Pas de fuite par les écritures** : `enregistrer`, `cocher` et `decocher` renvoient un `AccuseTache` (`id`, et `cle` pour une occurrence), jamais la `Tache` brute (échéance, statut, exceptions révéleraient le retard de l'autre). Seule la couche serveur lit le brut, via `lister`.
- **Le passé est à l'assigné** : un adulte non assigné ne peut ni cocher ni décocher une occurrence antérieure à aujourd'hui (jour Europe/Paris, horloge `maintenant` du dépôt). Le refus est identique que l'occurrence existe ou non (pas d'oracle). Aujourd'hui, l'avenir et les tâches sans échéance restent ouverts aux deux adultes.
- **Tâche de l'autre ayant du passé : intouchable** : sur une tâche existante dont l'assigné n'est pas l'auteur et dont l'échéance (ou l'ancre d'une série) est antérieure à aujourd'hui, `enregistrer` (avec id) et `supprimer` sont refusés par la même erreur que « Tâche inconnue : <id> » (aucune différence de message, pas d'oracle sur l'existence ni le statut). Refus complet, pas seulement des champs assigné/échéance/récurrence : plus simple et sûr.
- **Réinitialisation** : tout changement d'`assigneId`, quel que soit l'auteur (y compris l'assigné qui passe la tâche à l'autre), et, sur une tâche à venir ou sans échéance, tout changement d'`echeance` ou de `recurrence` par un non-assigné, statut, `faiteLe` et exceptions sont remis à zéro (rien de l'état de l'autre ne suit la tâche). Changer le titre ou l'enfant seul conserve l'état. Choix de la remise à zéro plutôt que du refus : l'avenir reste ouvert aux deux adultes.
- **Horloge** : `DepotTaches.aujourdhui()` (horloge `maintenant`, jour Europe/Paris) ; `tachesPourAdulte(depot, famille, adulteId, options)` ne prend plus de date de l'appelant, donc aucune date ne vient d'un client.
- **Oracle résiduel** : les ids sont séquentiels (`tache-N`, devinables). Un non-assigné qui écrit sur un id de l'autre obtient « inconnue » (passé) ou un succès (avenir ou sans échéance) : il apprend qu'une tâche de l'autre a du passé, jamais son statut ni ses dates. À fermer avec des ids non devinables côté Firestore. Cocher/décocher et supprimer ont la même nuance.
- **Liste blanche** : `enregistrer` ne retient que `titre`, `assigneId`, `echeance`, `recurrence` (`frequence`, `intervalle`, `fin`) et `enfantId`. `creeParId`, `statut`, `faiteLe`, `exceptions` ne viennent jamais de l'appelant. Passer de ponctuelle à série (ou l'inverse) remet le statut à « a_faire ».
- **Robustesse** : `cocher`/`decocher` valident `date` (date réelle) ; `datesRecurrence` refuse intervalle non entier >= 1 ou dates invalides et démarre l'itération près de la fenêtre (pas de boucle depuis l'ancre) ; `joursRattrapage` doit être un entier >= 0.

## Réserves

- Rattrapage des séries : fenêtre `joursRattrapage` (60 jours par défaut, paramètre de l'appel) pour ne pas lister des années d'occurrences non cochées. Une tâche ponctuelle en retard n'est jamais tronquée.
- Les deux adultes peuvent cocher une tâche visible (pas seulement l'assigné), sauf le passé de l'autre (voir Règle d'écriture).
- Les tâches faites ne sont pas listées dans les vues.
- Pas d'interface, pas de synchro Google Tasks ici.
