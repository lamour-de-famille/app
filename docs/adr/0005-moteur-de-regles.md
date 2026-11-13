# ADR 0005 — Moteur de règles de planning

Statut : accepté (2026-11-13)

## Décisions

- **Règles = données.** Trois types sérialisables (JSON) dans `src/lib/regles/types.ts`, stockées via `DepotFamille` (`listerRegles`, `enregistrerRegle`, `supprimerRegle`, journalisées, validées à l'écriture). Le moteur ne contient aucune valeur : jours, heures, parités, découpages et adultes viennent des règles.
  - `week_end` : parité de semaine ISO du jour de début (paire/impaire), jour+heure de début et de fin (la fin est la première occurrence strictement après le début).
  - `vacances` : filtre sur le nom de la période (sans accent ni casse) et la zone ; `parts` blocs consécutifs (2 = moitiés, 4 = quarts, etc.) ; le responsable de chaque bloc est listé pour les années paires et pour les années impaires ; point de départ du décompte (`jour_officiel` ou `lendemain`) ; heure de changement ; année de référence (début ou fin de période).
  - `derivee` : des enfants suivent un adulte sur les segments d'une règle source quand cet adulte y est responsable (pas de chaîne).
- **Fonctions pures** : `genererSegments` (plages continues de responsabilité) puis `genererCreneaux(regles, periodesVacances, mois)` → `Creneau[]` journaliers marqués `origine: regle`. Les périodes de vacances sont une entrée (`PeriodeVacances {nom, debut, fin, zone}`, `fin` incluse) ; l'import officiel viendra séparément.
- **Priorités** : en cas de chevauchement horaire pour un même enfant, la règle de plus forte priorité garde l'enfant, l'autre le perd (égalité : ordre des ids). Une dérivée hérite de la priorité de sa source. Le résultat ne dépend pas de l'ordre des règles.
- **Application** (`appliquerRegles(depot, auteurId, mois, periodes)`) : écrit gardes (jours couverts), présences (nuits chez le responsable), transferts (remise et reprise, un seul transfert aux changements de bloc, enfants regroupés) et créneaux. Les ids sont déterministes (`rg:...`) et les écritures identiques sont sans effet : relancer ne duplique rien ni ne journalise. Les créneaux, transferts, gardes et présences générés devenus obsolètes dans le mois sont retirés (voir Conséquences).
- **Déplacer** (`deplacerCreneau`) : le créneau garde son id et sa marque, reçoit un `ecart` (ancien et nouvel horaire) ; les applications suivantes ne l'écrasent ni ne le suppriment.

## Conséquences

- **Origine des gardes et présences.** `Garde` et `Presence` portent `origine?: "regle"`. `appliquerRegles` ne gère que celles marquées : il les écrit, et retire dans le mois appliqué celles que les règles ne veulent plus (règle désactivée, parité corrigée, enfant retiré). Une garde ou présence sans marque (échange accepté, saisie manuelle) n'est ni écrasée ni retirée, même si une règle voudrait un autre résultat ; les créneaux déplacés restent préservés. Le dépôt gagne `supprimerGarde` et `supprimerPresence`.
- Un chevauchement partiel retire l'enfant de tout le segment moins prioritaire (pas de découpage fin).
- Déplacer un créneau ne modifie ni garde, ni présence, ni transfert.

## Réserves consignées

- **Priorité vacances > week-ends.** La priorité est une donnée de la règle, non imposée : avec les valeurs fictives des tests (vacances 5, week-ends 0), un week-end ne retire jamais un bloc de vacances (test dédié). Une règle de week-end réglée au-dessus des vacances retire en revanche tout le bloc concerné, même pour un week-end court. Pas de garde-fou dans la validation (il figerait une valeur métier) ; l'écran de saisie des règles devra avertir.
- **Asymétrie prise/remise du dernier bloc.** Le dernier bloc de vacances finit à la fin du dernier jour inclus et ne produit pas de transfert de remise, alors que la prise du premier bloc en produit un. Le retour de vacances n'est donc pas un transfert : à décider avec l'écran Planning.
- **Convention des domiciles.** `adultes[0]` a le lieu `domicile_a`, `adultes[1]` le lieu `domicile_b` (`domicileDe`). À conserver tant que la famille a deux adultes ordonnés.
- **Retrait d'accents.** `sansAccent` normalise en NFD puis retire la plage des diacritiques combinants, écrite avec des échappements Unicode lisibles (U+0300 à U+036F) plutôt qu'avec des caractères invisibles.
