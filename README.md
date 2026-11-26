# Quizamily

Application de quiz familial : les membres d'une famille ajoutent des informations sur les **personnes centrales** (grands-parents, arrière-grands-parents...), l'app en tire une question envoyée chaque semaine, et les résultats enrichissent une **archive familiale** vivante.

## Statut actuel

MVP fonctionnel en version web (Expo + Supabase), en cours de test : création et rejoindre une famille, ajout de faits, pioche, réponse, validation des réponses libres, révélation, corrections et archives en version simple. Détail de l'avancement et prochains sujets dans [docs/roadmap.md](docs/roadmap.md). Charte visuelle et maquettes : [docs/design.md](docs/design.md).

## Documentation

- [docs/concept.md](docs/concept.md) — le concept produit : pitch, rôles, boucle de jeu, scoring, corrections, onboarding.
- [docs/data-model.md](docs/data-model.md) — le modèle de données.
- [docs/stack.md](docs/stack.md) — la stack technique choisie.
- [docs/roadmap.md](docs/roadmap.md) — les étapes de réalisation et les hypothèses encore ouvertes.
- [docs/ecrans.md](docs/ecrans.md) — description fonctionnelle des écrans du MVP.
- [docs/design.md](docs/design.md) — la charte visuelle (couleurs, polices, styles de boutons) et le lien vers les maquettes.
- [docs/question-templates.toml](docs/question-templates.toml) — le catalogue des templates de questions.
- [docs/brief-claude-code.md](docs/brief-claude-code.md) — **brief de reprise du code** après la conception du 24 au 26 novembre 2026 : quoi lire, comment optimiser les tests, programme par lots.
- [docs/rgpd.md](docs/rgpd.md) — première analyse RGPD (responsabilité de l'appli, personnes sans compte, suppression du compte à deux niveaux).
- [docs/deploiement-test.md](docs/deploiement-test.md) — faire tester l'appli à quelques proches, puis passer aux magasins d'applications (solutions, coûts, exigences).
- [docs/maquettes/LISEZMOI.md](docs/maquettes/LISEZMOI.md) — les maquettes du canvas « Quizamily – Pistes chaleureuses » et leur correspondance avec les écrans.
- [data/listes/LISEZMOI.md](data/listes/LISEZMOI.md) — les listes de référence (voitures, métiers, films, personnalités…) : fichiers, scripts de génération (`scripts/wikidata-listes.mjs`, `scripts/build-list-items.mjs`) et mise à jour de la base.

## Contexte

Projet solo, développé sur du temps libre (~1-2 jours/semaine). Un pilote manuel (sans code) avait été envisagé pour valider l'intérêt du concept avant de coder, mais cette étape a été écartée — on part directement sur la réalisation technique.
