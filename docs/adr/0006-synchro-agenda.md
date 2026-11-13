# ADR 0006 — Synchronisation Google Agenda

Statut : accepté (2026-11-13)

## Décisions

- **Un agenda par adulte** : chaque adulte écrit dans son propre agenda personnel, avec sa propre autorisation. Le client d'un adulte n'est jamais utilisé pour l'autre.
- **Marque propre** : chaque événement créé porte `extendedProperties.private` = `application=lamour-de-famille`, `cle=<clé stable>`, `empreinte=<hash du contenu>`. Sans cette marque (et une clé), un événement n'est **jamais** modifié ni supprimé : la liste est demandée filtrée par la marque, puis refiltrée localement.
- **Idempotence sans table de correspondance** : l'agenda est la source de vérité. On liste les événements marqués, puis on crée (clé absente), met à jour (empreinte différente) ou supprime (clé plus voulue). Relancer ne produit aucune écriture ; une coupure en plein passage se rattrape au passage suivant, et un éventuel doublon marqué est nettoyé.
- **Entrée pure** : `evenementsSouhaites` transforme présences (nuits regroupées par date et lieu), transferts (30 min) et créneaux en événements par adulte, de façon déterministe.
- **État visible** : par adulte, statut (`jamais`, `ok`, `erreur`, `a_reconnecter`), dernier succès, erreurs, nombre d'éléments, compteurs du dernier passage, via `StockageEtatSynchro` (version mémoire fournie ; persistance branchée avec le dépôt réel).
- **Autorisation expirée** (401 ou `invalid_grant`, `ErreurAutorisationExpiree`) : le passage s'arrête, l'état passe à `a_reconnecter` en gardant dernier succès et compte connu ; rien n'est supprimé. Après reconnexion, la reprise ne crée aucun doublon.
- **Tests** : doublure `AgendaFactice` (avec événements étrangers). `ClientAgendaGoogle` (HTTP réel) n'est testé qu'avec un faux `fetch`.

## Conséquences

Un événement dont la marque est retirée à la main dans Google est recréé au passage suivant. Le déclenchement (à chaque écriture, ou périodique), le stockage des jetons de rafraîchissement et la fenêtre de dates synchronisée restent à décider.
