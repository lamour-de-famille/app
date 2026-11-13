# ADR 0010 — Pages protégées et mode démonstration

Statut : accepté (2026-11-14)

## Contexte

Les pages Aujourd'hui et Planning étaient masquées en production par un `notFound()` conditionnel à `NODE_ENV` (cause des 404), et l'adulte venait d'un paramètre d'URL ou d'un champ de formulaire.

## Décision

- Les deux pages et leurs actions serveur appellent `exigerAdulte()` (`src/lib/acces/serveur.ts`). Sans session valide, redirection vers `/connexion`. La décision est une fonction pure testable : `resoudreAcces()` (`src/lib/acces/acces.ts`).
- L'adulte est déduit de l'e-mail de session via `ADULTES_EMAILS` (`idAdulte=email`, séparés par des virgules, insensible à la casse). L'adresse doit aussi figurer dans `ALLOWED_EMAILS` (ADR 0002), revérifiée à chaque requête. E-mail sans adulte de la famille : refus. Secret de session absent ou trop court : pas de session, donc redirection (jamais d'erreur 500).
- Mode démonstration : seulement si `MODE_DEMO=1` ET `NODE_ENV !== "production"`. Alors `?adulte=<id>` (id lu dans `famille.adultes`, défaut : le premier) et le dépôt de démonstration sont permis. En production, le paramètre est ignoré et aucun adulte de démonstration n'existe.
- Le `notFound()` est retiré : il n'y a plus de masquage de route par environnement.
- Le choix du dépôt tient en une seule fonction, `obtenirDepot()` (`src/lib/acces/depot.ts`). Hors démonstration, elle renvoie le `DepotFirestore` réel (ADR 0009) : projet `FIRESTORE_PROJECT_ID`, famille `FAMILLE_ID`, client `ouvrirBanqueFirestore`. La famille est lue en base ; `adulteDepuisEmail` s'appuie sur elle. Si la configuration manque ou si la famille n'existe pas en base : `ErreurNonConfigure`, et la garde redirige vers `/non-configure` (« application non configurée »). Aucune fixture, jamais `familleFictive` hors démonstration, et aucune écriture n'est possible sans base (plus de mémoire perdue au redémarrage). Un dépôt (une banque) est injectable pour les tests.
- Compte autorisé (`ALLOWED_EMAILS`) mais absent de `ADULTES_EMAILS` : redirection vers `/connexion?erreur=adulte-absent`, avec un message explicite.

## Mise en production (propriétaire)

1. Écrire le fichier JSON de la famille hors dépôt (motifs ignorés par git : `famille.local.json`, `*.famille.json`). Modèle générique fictif : `docs/exemples/famille.exemple.json` (Alex, Sam). Deux adultes exactement.
2. Créer la famille en base, une seule fois (l'opération refuse d'écraser une famille existante) :
   `FIRESTORE_PROJECT_ID=<projet> FAMILLE_ID=<id> FAMILLE_JSON=famille.local.json npm run initialiser-famille`
3. Renseigner sur l'hébergeur `FIRESTORE_PROJECT_ID`, `FAMILLE_ID`, `ADULTES_EMAILS` (par exemple `alex=alex@exemple.invalid,sam=sam@exemple.invalid`, avec les ids d'adultes du fichier) et `ALLOWED_EMAILS`.

## Conséquences

La famille vient toujours de la base hors démonstration. Sans amorçage, l'application affiche « application non configurée ».
