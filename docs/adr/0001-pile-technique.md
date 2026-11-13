# ADR 0001 — Pile technique

Statut : accepté (2026-11-13)

Next.js (App Router) + TypeScript strict, PWA via manifeste, vitest pour les tests, ESLint. Cible : conteneur sur Cloud Run (europe-west9), sortie `standalone`, base Firestore native. En développement et en test : émulateur Firestore et doublures, jamais d'appel réel. La logique métier vit dans `src/lib`, indépendante de l'interface et de la base (accès via des interfaces de dépôt), ce qui la rend testable sans réseau.
