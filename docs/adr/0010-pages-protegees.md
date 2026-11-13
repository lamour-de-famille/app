# ADR 0010 — Pages protégées et mode démonstration

Statut : accepté (2026-11-14)

## Contexte

Les pages Aujourd'hui et Planning étaient masquées en production par un `notFound()` conditionnel à `NODE_ENV` (cause des 404), et l'adulte venait d'un paramètre d'URL ou d'un champ de formulaire.

## Décision

- Les deux pages et leurs actions serveur appellent `exigerAdulte()` (`src/lib/acces/serveur.ts`). Sans session valide, redirection vers `/connexion`. La décision est une fonction pure testable : `resoudreAcces()` (`src/lib/acces/acces.ts`).
- L'adulte est déduit de l'e-mail de session via `ADULTES_EMAILS` (`idAdulte=email`, séparés par des virgules, insensible à la casse). L'adresse doit aussi figurer dans `ALLOWED_EMAILS` (ADR 0002), revérifiée à chaque requête. E-mail sans adulte de la famille : refus. Secret de session absent ou trop court : pas de session, donc redirection (jamais d'erreur 500).
- Mode démonstration : seulement si `MODE_DEMO=1` ET `NODE_ENV !== "production"`. Alors `?adulte=alex|sam` (défaut alex) et le dépôt de démonstration sont permis. En production, le paramètre est ignoré et aucun adulte de démonstration n'existe.
- Le `notFound()` est retiré : il n'y a plus de masquage de route par environnement.
- Le choix du dépôt tient en une seule fonction, `obtenirDepot()` (`src/lib/acces/depot.ts`). Aujourd'hui : doublure mémoire vide (famille fictive) hors démonstration, dépôt de démonstration en mode démo. L'adaptateur Firestore se branchera dans cette fonction uniquement. Tant qu'il ne l'est pas, la production n'affiche aucune donnée (les données mémoire ne survivent pas à un redémarrage).

## Conséquences

Pour l'instant la famille (donc les ids d'adultes pour `ADULTES_EMAILS`) vient de la fixture fictive ; elle viendra du dépôt réel avec Firestore.
