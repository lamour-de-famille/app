# ADR 0005 — Moteur de règles de planning

Statut : accepté (2026-11-13)

## Décisions

- **Règles = données.** Trois types sérialisables (JSON) dans `src/lib/regles/types.ts`, stockées via `DepotFamille` (`listerRegles`, `enregistrerRegle`, `supprimerRegle`, journalisées, validées à l'écriture). Le moteur ne contient aucune valeur : jours, heures, parités, découpages et adultes viennent des règles.
  - `week_end` : parité de semaine ISO du jour de début (paire/impaire), jour+heure de début et de fin (la fin est la première occurrence strictement après le début).
  - `vacances` : filtre sur le nom de la période (sans accent ni casse) et la zone ; `parts` blocs consécutifs (2 = moitiés, 4 = quarts, etc.) ; le responsable de chaque bloc est listé pour les années paires et pour les années impaires ; point de départ du décompte (`jour_officiel` ou `lendemain`) ; heure de changement ; année de référence (début ou fin de période).
  - `derivee` : des enfants suivent un adulte sur les segments d'une règle source quand cet adulte y est responsable (pas de chaîne).
- **Fonctions pures** : `genererSegments` (plages continues de responsabilité) puis `genererCreneaux(regles, periodesVacances, mois)` → `Creneau[]` journaliers marqués `origine: regle`. Les périodes de vacances sont une entrée (`PeriodeVacances {nom, debut, fin, zone}`, `fin` incluse) ; l'import officiel viendra séparément.
- **Priorités** : en cas de chevauchement horaire pour un même enfant, la règle de plus forte priorité garde l'enfant, l'autre le perd (égalité : ordre des ids). Une dérivée hérite de la priorité de sa source. Le résultat ne dépend pas de l'ordre des règles.
- **Application** (`appliquerRegles(depot, auteurId, mois, periodes)`) : écrit gardes (jours couverts), présences (nuits chez le responsable), transferts (remise et reprise, un seul transfert aux changements de bloc, enfants regroupés) et créneaux. Les ids sont déterministes (`rg:...`) et les écritures identiques sont sans effet : relancer ne duplique rien ni ne journalise. Les créneaux et transferts générés devenus obsolètes dans le mois sont retirés.
- **Déplacer** (`deplacerCreneau`) : le créneau garde son id et sa marque, reçoit un `ecart` (ancien et nouvel horaire) ; les applications suivantes ne l'écrasent ni ne le suppriment.

## Conséquences

Un chevauchement partiel retire l'enfant de tout le segment moins prioritaire (pas de découpage fin). Gardes et présences ne sont pas nettoyées quand une règle disparaît (seuls créneaux et transferts le sont). Déplacer un créneau ne modifie ni garde, ni présence, ni transfert.
