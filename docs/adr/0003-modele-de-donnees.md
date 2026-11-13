# ADR 0003 — Modèle de données du coeur

Statut : accepté (2026-11-13)

## Décisions

- **Garde et présence sont séparées**, par enfant et par date (`AAAA-MM-JJ`). La garde dit qui est responsable ; la présence dit où l'enfant dort ce soir. Les deux peuvent diverger (un adulte responsable, l'enfant dormant chez l'autre).
- **Dépôts abstraits** : l'interface `DepotFamille` (asynchrone) est la seule porte d'accès aux données. `DepotMemoire` sert aux tests et au développement. Les deux adultes voient et modifient tout.
- **Journal** : chaque écriture passant par le dépôt est tracée (auteur, instant, objet, avant/après) et produit un événement « à notifier » pour l'autre adulte, jamais pour l'auteur. L'envoi des notifications est hors périmètre.
- **Échange** : accepter une demande applique la garde et la présence (domicile du responsable demandé) aux enfants et jours concernés ; refuser ne change rien ; seul l'autre adulte répond.
- **Créneau** : peut porter une marque d'origine `regle` (id de règle, écart). Les valeurs des règles seront des paramètres en base ; le moteur viendra dans une autre PR.
- **Firestore** sera branché plus tard comme seconde implémentation de `DepotFamille`, testée via l'émulateur, sans changer les appelants.

## Conséquences

Une famille compte exactement deux adultes. Les horodatages sont en ISO 8601 UTC ; les dates et heures réglées sont des chaînes sans fuseau.
