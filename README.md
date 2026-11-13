# L'amour de famille (app)

Application familiale de coparentalité : planning de garde, agendas, tâches. Code public, aucune donnée personnelle ; les exemples utilisent une famille fictive (Alex, Sam, Léo, Mila, Nina).

## Démarrer
```
npm ci
npm run dev        # http://localhost:3000
npm run check      # lint + types + tests
```
Si `NODE_ENV=production` est défini dans votre shell, un fichier `.npmrc` force tout de même l'installation des dépendances de développement.

## Organisation
- `src/app` : écrans et routes (Next.js, App Router)
- `src/lib` : logique métier testable sans réseau
- `docs/adr` : décisions d'architecture ; `docs/HYPOTHESES.md` ; `docs/AVANCEMENT.md`

## Développement local
Aucun appel réel à Google : émulateur Firestore et doublures. Modèle de variables : `.env.example` (sans valeurs).

## Déploiement
`Dockerfile` pour Cloud Run (europe-west9). Aucun déploiement automatique.
