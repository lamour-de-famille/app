# ADR 0017 — Récapitulatif du lendemain et abonnements push

Statut : accepté (2026-11-14)

## Décisions

Code dans `src/lib/notifications/` (`recapitulatif.ts`, `preferences.ts`, `acces-notifications.ts`). Complète l'ADR 0014.

- **Préférences par adulte** : `StockagePreferences` (mémoire pour l'instant), `{ actif, heure }`, heure HH:MM de 00:00 à 23:59 en Europe/Paris. Validation stricte (`validerPreferences`) : deux champs exactement, types exacts. Sans préférence : actif, heure de `NOTIFICATIONS_HEURE_RECAP` (défaut 20:00).
- **Envoi** : `RecapitulatifService.envoyerRecapitulatifs(maintenant)`, appelé toutes les 15 minutes. Pour chaque adulte dont l'heure est atteinte et qui n'a rien reçu ce jour-là : un seul message, rédigé par Gemini en un appel (`ClientGemini.rediger`), repli sur un texte fixe fait de comptes, sans IA (ex. « Demain : 1 transfert, 2 tâches. »). Rien à dire : rien n'est envoyé.
- **Contenu** : gardes, présences, transferts et créneaux du lendemain (visibles par les deux adultes), les tâches du lendemain de CET adulte, et les éléments regroupés de la file (`FileRegroupement.vider`). Les tâches viennent de `tachesPourAdulte` appelé pour cet adulte seul, sur un dépôt dont « aujourd'hui » est le lendemain : le retard de l'autre adulte n'est ni calculé ni transmis à Gemini, et le retard de l'adulte lui-même n'est pas repris.
- **DÉCISION : le récapitulatif ne compte pas dans le plafond de 10, mais il est limité à 1 par jour et par destinataire.** Il sert justement à écouler ce que le plafond a retenu ; le compter l'empêcherait de partir quand le plafond est atteint. Pour que cela ne contourne pas la limite, la limite de 1 est une constante du serveur (`MAX_RECAPITULATIFS_PAR_JOUR`), appliquée par réservation atomique sur une clé `recap:<adulte>:<jour>` (compteur distinct de `notif:`). Elle n'est ni configurable ni fournie par un appelant. La place est rendue, et la file remise, si aucun appareil n'a reçu le message.
- **Routes** : `POST /api/notifications/recapitulatif` (secret `NOTIFICATIONS_SECRET` de 32 caractères minimum en `Authorization: Bearer`, ou session d'adulte autorisé ; la base n'est pas ouverte avant l'authentification ; la réponse ne contient que des statuts). `POST` et `DELETE /api/notifications/abonnement` : session obligatoire, l'adulte vient de la session via la garde, un champ adulte dans la requête est refusé, `DELETE` ne retire que les appareils de l'adulte connecté.

## Limites

- Préférences, abonnements, file, compteurs et dépôt de tâches sont en mémoire du processus : la version Firestore viendra avec le câblage. Tant que le dépôt de tâches n'est pas en base, le récapitulatif de production n'a pas de tâches.
- Sans clés VAPID, l'envoi est une doublure (aucun envoi réel) ; sans `GEMINI_API_KEY`, le texte de repli est utilisé.
- Pas d'écran de réglage ni d'aide iPhone ici (autre PR). Cloud Scheduler : à créer par le propriétaire (`*/15 * * * *`, en-tête `Authorization: Bearer`).
