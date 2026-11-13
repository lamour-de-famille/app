# Avancement

Mise à jour : 2026-11-13

## ARRÊT : jeton GitHub manquant

Aucun jeton n'est configuré pour le compte dédié `lamour-de-famille` : la lecture publique du dépôt fonctionne, mais l'envoi (push), les pull requests et la CI sont impossibles.

**À faire :** créer un jeton à portée limitée au seul dépôt `lamour-de-famille/app` (contenu et pull requests en lecture/écriture, workflows), le fournir via le gestionnaire d'identifiants Git ou `gh auth login` avec ce compte, puis relancer la session. Créer aussi la branche `develop` côté GitHub (ou me laisser la pousser).

## Fait
- Définitions d'agents dans `.claude/agents/`
- Garde-fous : `.env.example` sans valeurs, `.gitleaks.toml`, hook `pre-commit` (identité + secrets), CI gitleaks
- `docs/HYPOTHESES.md`, `docs/adr/`

## En cours
Rien (arrêt).

## Reste
Lot 1, lot 2, lot 3 (voir le plan de travail du coordinateur).
