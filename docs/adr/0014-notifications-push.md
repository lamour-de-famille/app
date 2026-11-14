# ADR 0014 — Notifications web push et plafond quotidien

Statut : accepté (2026-11-14)

## Décisions

Code dans `src/lib/notifications/`. Web push uniquement (ni SMS ni appel). Aucun envoi réel en test.

- **Abonnements** : `StockageAbonnements` (mémoire pour l'instant), par adulte, plusieurs appareils possibles. Un endpoint n'appartient qu'à un seul adulte : l'enregistrer pour un autre adulte le retire au premier, pour ne jamais notifier la mauvaise personne sur un appareil partagé.
- **Envoi** : interface `EnvoyeurPush`. Réel : `EnvoyeurPushWebPush` (bibliothèque `web-push`, clés VAPID lues dans `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, sans valeur dans `.env.example`), jamais exécuté en test. Doublure : `EnvoyeurPushFactice`. Un 404 ou 410 devient `AbonnementExpire` et le service retire l'abonnement.
- **Texte** : rédigé par `ClientGemini.rediger` (donc soumis au plafond IA), consigne sans nom de famille, adresse, santé ni argent, puis ramené à 120 caractères. Si Gemini échoue, si le plafond IA est atteint ou si le texte est vide : texte fixe de repli.
- **Plafond de 10 par jour et par destinataire**, dans `ServiceNotifications` : jour Europe/Paris, valeur dans `NOTIFICATIONS_MAX_PAR_JOUR` (défaut 10, dans `configuration.ts`), fixée à la construction du service et absente des paramètres de `notifier`. La place est réservée de façon atomique (`StockageCompteurNotifications.reserver`) avant tout envoi, donc des appels parallèles ne dépassent pas le plafond. Au-delà : rien n'est envoyé, le texte part dans `FileRegroupement` pour le récapitulatif. La notification compte, pas l'appareil.
- La réservation est rendue si aucun appareil n'est abonné ou si aucun envoi n'aboutit.

## Limites

- Les stockages sont en mémoire : abonnements, compteurs et file sont perdus au redémarrage ; la version Firestore viendra avec le câblage. Le compteur Firestore devra utiliser une transaction pour garder l'atomicité.
- Les clés VAPID sont à générer par le propriétaire hors dépôt.
- iPhone : le web push n'y fonctionne que pour l'application ajoutée à l'écran d'accueil (iOS 16.4 ou plus) ; l'écran d'aide viendra dans une PR suivante.
