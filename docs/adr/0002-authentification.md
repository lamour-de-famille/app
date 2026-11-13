# ADR 0002 — Authentification

Statut : accepté (2026-11-13)

Connexion « Se connecter avec Google » ; accès restreint à une liste d'adresses autorisées lue dans la variable d'environnement `ALLOWED_EMAILS` (séparées par des virgules). Raison : option la plus simple, sans base d'utilisateurs, modifiable sans migration. Le fournisseur Google est derrière une interface ; en test, une doublure fournit l'identité. Aucun identifiant réel dans le dépôt.
