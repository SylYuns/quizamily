# Roadmap

## État actuel (2026-11-10)

Le MVP fonctionne de bout en bout en version simple, testé avec des comptes jetables et avec un deuxième vrai compte. Construit : auth, création/rejoindre une famille (avec « réclamer un profil existant »), ajout de faits (cas simple, 24/32 templates), « Mes faits » (modifier/supprimer, statut posé/révélé correct), pioche (manuelle + automatique hebdomadaire), réponse, validation des réponses libres (anonyme), révélation (manuelle + automatique à la deadline), correction d'un fait avec recalcul rétroactif des scores, et archives en version simple — étapes 1 à 4, 6 à 9, 11 et 12 (version simple) de la liste ci-dessous. Pas commencé : étapes 5, 7, 10, 13.

**Pour reprendre le travail (ex. depuis un autre ordinateur)** : voir « Points à décider » et « Prochains sujets » plus bas sur cette page.

## Étapes de réalisation

1. Setup Expo + Supabase, schéma DB + RLS.
2. Auth + création famille + désignation des personnes centrales + relations de départ.
3. Invitations (lien) + flux de rejoindre une famille.
4. Catalogue de templates + formulaire d'ajout de fait (champs guidés par type) + « Mes faits ». *(fait pour le cas simple — 24/32 templates, section « Mes faits » avec modifier/supprimer ; reste : personne liée `<conjoint>`, élément `<pays>`, types city/place — le vrai statut posé/révélé de « Mes faits » attend l'étape 6)*
5. Mini arbre familial (vue simple des personnes + relations).
6. Logique de pioche pondérée (fraîcheur + répartition auteurs) + Edge Function de création de session. *(fait : `supabase/functions/create-quiz-session` pour le déclenchement manuel, plus `auto_create_quiz_sessions()` + tâche `pg_cron` hebdomadaire (lundi 8h) pour le déclenchement automatique — voir étape 9 pour le détail du cron)*
7. Emails (nouvelle session, rappel, résultats).
8. Écran de réponse au quiz + logique du seuil de déclenchement du premier quiz. *(écran de réponse fait en version simple — `src/app/respond.tsx` ; seuil appliqué : la pioche automatique ne se déclenche que pour une famille ayant au moins 3 joueurs, voir « Décisions déjà prises » — reste : verrouillage de la réponse après la deadline, actuellement sans effet puisque la révélation auto absorbe ce cas)*
9. Révélation automatique à la deadline, calcul des scores (4 états) + validation des réponses libres par l'auteur (notifications, révélation différée, prise de main). *(fait en version simple — `src/app/reveal.tsx` + `src/app/validate.tsx` pour le déclenchement manuel par l'auteur, plus `auto_reveal_expired_sessions()` + tâche `pg_cron` horaire pour clôturer automatiquement toute session dont la deadline est dépassée (réponses manquantes ou en attente de validation comptées fausses) — reste : prise de main, notifications/relances, score cumulé inter-sessions)*
10. Réactions/commentaires sur les faits révélés.
11. Mécanisme de correction + recalcul rétroactif des scores. *(fait — `propose_correction`/`validate_correction`, voir `docs/ecrans.md` écran 8 ; accessible aussi depuis les archives, qui réutilisent l'écran de révélation pour le détail d'une question au-delà de la dernière révélation)*
12. Archive familiale enrichie (catégories, filtres, recherche) + score de contribution + relances. *(fait en version simple — `src/app/archive.tsx`, choix de la personne centrale puis liste des questions révélées la concernant, détail via `src/app/reveal.tsx` ; reste : regroupement par catégorie, auteur/anecdote/date de révélation/taux de bonnes réponses par fait, recherche, frise chronologique, score de contribution, relances)*
13. Polish, puis phase 2 : push notifications + builds iOS/Android.

## Scope du premier MVP partageable (test avec 2-3 personnes)

Volontairement réduit par rapport à la liste complète ci-dessus :

**Inclus** : auth + création famille + invite, création des personnes centrales (relations simplifiées), un catalogue réduit de ~15-20 templates codés en dur (pas de back-office d'édition), ajout de faits, pioche + session de quiz (version simple au début, pas besoin du roulement pondéré sophistiqué dès le jour 1), réponse, validation des réponses libres par l'auteur (écran de validation + emails de rappel à l'auteur et d'attente aux joueurs ; la prise de main peut attendre), révélation (scores + contexte), emails (nouvelle question + résultats), archives en version simple (liste des questions révélées concernant une personne centrale).

**Reporté après le premier test** : réactions/commentaires, mécanisme de correction, relances de contribution, vue arbre familial, pièces jointes (photo/audio) sur les faits, notifications push, builds natifs iOS/Android (le web suffit pour tester avec 2-3 personnes).

## Estimation de charge (solo, ~1-2 jours/semaine, dev généraliste mais nouveau sur Expo/Supabase)

| Étape | Heures |
|---|---|
| Montée en compétence (petit projet-test Expo + Supabase) | 15-20h |
| Setup réel (projet, schéma, RLS, déploiement) | 4-6h |
| Auth + famille + invite | 8-12h |
| Personnes centrales (simplifié) | 6-10h |
| Catalogue de faits + formulaire guidé | 14-20h |
| Logique de session/pioche (version simple) | 10-14h |
| Flow de réponse | 8-12h |
| Écran de révélation | 8-12h |
| Emails | 8-12h |
| Déploiement web partageable | 2-4h |
| Marge debug/imprévu | 25-35h |
| **Total** | **~110 à 155h, soit ~11 à 16 semaines (3-4 mois)** |

Conseil : commencer par un mini projet jetable (pas le vrai modèle de données) pour apprendre les bases d'Expo + Supabase avant d'attaquer le vrai schéma.

## Validation / audience

Un pilote manuel sans code (Google Form + pioche manuelle + WhatsApp) avait été envisagé pour tester la boucle de jeu avant de coder, mais cette étape a été écartée — on part directement sur la réalisation technique.

Pistes de validation gardées en tête pour plus tard : discuter avec des personnes ayant des parents/grands-parents âgés, sonder des communautés de généalogie, et surtout suivre le **taux de rétention des familles testeuses** (pas juste l'enthousiasme initial) une fois le MVP partageable.

## Points à décider

Décisions de produit ou de sécurité pas encore tranchées — à trancher avant d'avancer sur le sujet concerné, ou à accepter explicitement comme compromis pour l'instant :

- **Faits avec personne liée (`<conjoint>`) ou élément choisi (`<pays>`)** : 8 des 32 templates du catalogue en dépendent (voir `question-templates.toml`), pas encore proposés dans « Ajouter un fait ». Reste à concevoir l'UI de choix/création d'une personne liée.
- **Emails/notifications** : aucune vraie notification n'existe encore (nouvelle session, rappel, relance de validation, résultats) — le calcul de timing ("24h avant la deadline") existe déjà côté logique (réutilisé pour débloquer la validation anonyme), mais rien n'envoie d'email. Fournisseur : Resend reste actif, en sandbox (pas de domaine vérifié — décision déjà prise de ne pas en acheter un pour l'instant, voir ci-dessous).
- **« Prise de main »** : un joueur reprenant la validation des réponses libres à la place de l'auteur après 7 jours (prévu dans `concept.md`) — pas construit, dépend des notifications ci-dessus.
- **Accord grammatical féminin/masculin** des questions (ex. « il/elle a pris l'avion ») — sujet technique ouvert depuis le début (voir `question-templates.toml`), jamais tranché.
- **Fuite résiduelle, type `list`** : le champ de réponse propose les mêmes suggestions qu'à la création du fait, ce qui peut révéler la bonne réponse si une liste a très peu de valeurs (voir `docs/data-model.md`). Pas corrigé, jugé à faible risque avec peu de testeurs — à revoir avant une ouverture plus large.
- **Fuite résiduelle, `facts.answer_value`** : un fait pas encore posé reste techniquement lisible par n'importe quel membre de la famille via une requête directe (la policy RLS n'est pas conditionnée par le statut posé/révélé) — demanderait une policy plus fine ou de déplacer `answer_value` dans une table séparée pour fermer complètement (voir `docs/data-model.md`).
- **Direction visuelle** (coloré/chaleureux, bleu-blanc-rouge — voir `concept.md`) : documentée depuis le début, jamais appliquée. Tous les écrans utilisent encore un style minimal (gris/bleu uni) pour avancer vite sur les fonctionnalités.

## Décisions déjà prises (pour éviter de les re-discuter)

- Une session de quiz = **une seule question** (pas un lot), avec une semaine pour y répondre (clarifié le 2026-11-09, voir `concept.md`).
- Terminologie retenue : **« personne centrale »** (pas « personne fondatrice », « vedette », etc.).
- Pas de QCM en V1 : les joueurs répondent avec le même champ guidé que l'auteur du fait.
- Seuil du quiz automatique : au moins 3 joueurs dans la famille, sinon la pioche automatique hebdomadaire ne se déclenche pas pour cette famille (`auto_create_quiz_sessions()`, voir migration `20261109240000_automatic_triggering.sql`).
- Déclenchement automatique (2026-11-10) : pioche hebdomadaire (lundi 8h) et révélation à la deadline (vérifiée toutes les heures, réponses manquantes/en attente comptées fausses) tournent via `pg_cron`, en plus des boutons manuels qui restent disponibles (pioche immédiate, révélation dès que tout le monde a répondu).
- Resend reste l'envoyeur d'email (sandbox, pas de domaine acheté) — ne pas reproposer de le désactiver.
- Catalogue de templates géré par nous, pas par les familles, en V1.
- Pas de maximum technique sur le nombre de personnes centrales (recommandation UI : 1 à 4). Une nouvelle personne centrale peut être ajoutée à tout moment, sans gatekeeper.

## Prochains sujets (à choisir, ou proposer autre chose)

- Les 8 templates restants d'« Ajouter un fait » (personne liée, pays, ville/lieu).
- Mini arbre familial (étape 5, vue simple des personnes et de leurs relations).
- Emails/notifications (nouvelle session, rappels, résultats, relances de validation) + « prise de main ».
- Enrichissement des archives (étape 12) : regroupement par catégorie, auteur/anecdote/date de révélation/taux de bonnes réponses par fait, recherche par mot-clé, frise chronologique.
- Réactions/commentaires sur les faits révélés.
- Score de contribution + relances si un membre n'a rien ajouté.
- Application de la direction visuelle (coloré, bleu-blanc-rouge).
- Fermer les deux fuites résiduelles notées plus haut (type `list`, `facts.answer_value`).
- Phase 2 : notifications push, builds natifs iOS/Android.
