# ADR 0008 — Outils rapides de planning

Statut : accepté (2026-11-13)

## Décisions

Trois fonctions dans `src/lib/outils/outils.ts`, écrites sur `DepotFamille` (aucune valeur métier codée) :

- `dupliquerSemaine(depot, auteurId, semaineSource, semaineCible)` : lundis des deux semaines ; copie gardes, présences et transferts (lundi à dimanche) en décalant les dates. Les créneaux ne sont pas copiés (ils viennent des règles).
- `appliquerMotif(depot, auteurId, motif, debut, fin, enfantIds?)` : motif = liste cyclique de `{responsableId, lieuId}`, le jour de début prend l'entrée 0. Tous les enfants par défaut.
- `echangerDeuxJours(depot, auteurId, jourA, jourB, enfantIds?)` : permute gardes et présences ; si un seul des jours a une entrée, elle est déplacée. Les transferts ne bougent pas.

Propriétés communes :

- Saisies **sans** `origine: "regle"` : `appliquerRegles` ne les écrase ni ne les retire (voir ADR 0005). Une garde ou présence marquée « règle » qui est touchée devient une saisie manuelle.
- Journal et notification de l'autre adulte assurés par le dépôt, à chaque écriture.
- **Atomicité** : tout est validé (auteur, dates réelles, lundis, adultes, lieux, enfants, plage de 366 jours au plus, source non vide) et les écritures sont préparées avant la première écriture ; une erreur de saisie n'écrit donc rien. `DepotFamille` n'a pas de transaction : une panne du stockage en cours d'écriture peut laisser un résultat partiel (relancer l'outil termine le travail, les outils étant idempotents).
- Idempotence : une écriture identique à l'existant est ignorée (pas de doublon, pas d'entrée de journal).
- **Échange de jours** : les créneaux issus de règles des enfants concernés sur ces deux jours restent à leur place et reçoivent un `ecart` (« jour échangé avec le … »), comme un déplacement ; les créneaux manuels ne sont pas touchés.

## Réserves

- Le plafond de 366 jours de `appliquerMotif` est un garde-fou technique.
- Le remplacement des saisies existantes sur la cible (copie, motif) est silencieux ; l'écran devra demander confirmation.
