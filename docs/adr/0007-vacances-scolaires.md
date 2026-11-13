# ADR 0007 — Vacances scolaires

Statut : accepté (2026-11-13)

Les vacances viennent du jeu ouvert « fr-en-calendrier-scolaire » (data.education.gouv.fr, API Explore v2.1, sans clé). Le client est derrière l'interface `ClientVacances` ; en test, une doublure lit une fixture JSON locale et le `fetch` du client réel est simulé : aucun appel réseau.

- Académie, zone et année scolaire sont en configuration (`VACANCES_ACADEMIE`, `VACANCES_ZONE`, `VACANCES_ANNEE_SCOLAIRE`), vides par défaut = pas de filtre.
- La normalisation est pure : dates converties en jour civil de Paris (`AAAA-MM-JJ`), enregistrements invalides ou « Enseignants » ignorés, doublons fusionnés, tri par début.
- Les dates sont les dates officielles brutes : le choix « jour officiel ou lendemain » (reprise, veille) appartient au moteur de règles.
- Une panne réseau lève `ErreurVacances` ; l'appelant garde les dernières périodes connues.
