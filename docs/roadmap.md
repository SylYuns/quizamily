# Roadmap

## État actuel (2026-11-10)

Le MVP fonctionne de bout en bout en version simple, testé avec des comptes jetables et avec un deuxième vrai compte. Construit : auth, création/rejoindre une famille (avec « réclamer un profil existant »), ajout de faits (32/32 templates, y compris personne liée `<conjoint>` et élément choisi `<pays>`), « Mes faits » (modifier/supprimer, statut posé/révélé correct), mini arbre familial (lecture + ajout de relations), pioche (manuelle + automatique hebdomadaire), réponse, validation des réponses libres (anonyme), révélation (manuelle + automatique à la deadline), correction d'un fait avec recalcul rétroactif des scores, et archives en version simple — étapes 1 à 6, 8, 9, 11 et 12 (version simple) de la liste ci-dessous. Pas commencé : étapes 7, 10, 13.

**Pour reprendre le travail (ex. depuis un autre ordinateur)** : voir « Points à décider » et « Prochains sujets » plus bas sur cette page.

## Étapes de réalisation

1. Setup Expo + Supabase, schéma DB + RLS.
2. Auth + création famille + désignation des personnes centrales + relations de départ.
3. Invitations (lien) + flux de rejoindre une famille.
4. Catalogue de templates + formulaire d'ajout de fait (champs guidés par type) + « Mes faits ». *(fait — 32/32 templates, y compris la résolution d'une personne liée (`<conjoint>` : détection automatique si déjà connue, sinon choix parmi les personnes existantes ou création à la volée) et le choix d'un élément (`<pays>`), voir migration `20261109250000_linked_person_and_slot_templates.sql` ; section « Mes faits » avec modifier/supprimer et statut posé/révélé correct)*
5. Mini arbre familial (vue simple des personnes + relations). *(fait — `src/app/family-tree.tsx` : une carte par personne centrale avec conjoint·e/parents/frères et sœurs/enfants, liste des autres membres, formulaire pour lier deux personnes (conjoint ou parent-enfant), et création d'une personne manquante à la volée dans ce formulaire (ex : la génération intermédiaire entre une personne centrale et ses petits-enfants, si eux seuls ont un compte) ; reste : vraie capture par paire du lien de parenté du créateur avec chaque personne centrale, voir écran 2 dans `docs/ecrans.md`)*
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

**Reporté après le premier test** : réactions/commentaires, relances de contribution, pièces jointes (photo/audio) sur les faits, notifications push, builds natifs iOS/Android (le web suffit pour tester avec 2-3 personnes). *(mécanisme de correction et vue arbre familial, listés ici à l'origine, sont finalement déjà construits — voir « État actuel » en haut de page.)*

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

- **Emails/notifications** : aucune vraie notification n'existe encore (nouvelle session, rappel, relance de validation, résultats) — le calcul de timing ("24h avant la deadline") existe déjà côté logique (réutilisé pour débloquer la validation anonyme), mais rien n'envoie d'email. Fournisseur : Resend reste actif, en sandbox (pas de domaine vérifié — décision déjà prise de ne pas en acheter un pour l'instant, voir ci-dessous).
- **« Prise de main »** : un joueur reprenant la validation des réponses libres à la place de l'auteur après 7 jours (prévu dans `concept.md`) — pas construit, dépend des notifications ci-dessus.
- **Accord grammatical féminin/masculin** des questions (ex. « il/elle a pris l'avion ») — sujet technique ouvert depuis le début (voir `question-templates.toml`), jamais tranché.
- **Fuite résiduelle, type `list`** : le champ de réponse propose les mêmes suggestions qu'à la création du fait, ce qui peut révéler la bonne réponse si une liste a très peu de valeurs (voir `docs/data-model.md`). Pas corrigé, jugé à faible risque avec peu de testeurs — à revoir avant une ouverture plus large.
- **Fuite résiduelle, `facts.answer_value`** : un fait pas encore posé reste techniquement lisible par n'importe quel membre de la famille via une requête directe (la policy RLS n'est pas conditionnée par le statut posé/révélé) — demanderait une policy plus fine ou de déplacer `answer_value` dans une table séparée pour fermer complètement (voir `docs/data-model.md`).
- **Direction visuelle** (coloré/chaleureux, bleu-blanc-rouge — voir `concept.md`) : documentée depuis le début, jamais appliquée. Tous les écrans utilisent encore un style minimal (gris/bleu uni) pour avancer vite sur les fonctionnalités.
- **`relationship_label` pas encore un vrai lien par paire** : reste un champ texte simple posé par le créateur de la famille sur sa propre perception (ex: "Grand-mère" = grand-mère du créateur), pas une relation stockée dans `relationships` entre le créateur et chaque personne centrale — contrairement aux liens que l'arbre familial (étape 5) sait maintenant capturer pour tout le monde. Pas bloquant, juste incohérent avec le reste du modèle.

## Décisions déjà prises (pour éviter de les re-discuter)

- Une session de quiz = **une seule question** (pas un lot), avec une semaine pour y répondre (clarifié le 2026-11-09, voir `concept.md`).
- Terminologie retenue : **« personne centrale »** (pas « personne fondatrice », « vedette », etc.).
- Pas de QCM en V1 : les joueurs répondent avec le même champ guidé que l'auteur du fait.
- Seuil du quiz automatique : au moins 3 joueurs dans la famille, sinon la pioche automatique hebdomadaire ne se déclenche pas pour cette famille (`auto_create_quiz_sessions()`, voir migration `20261109240000_automatic_triggering.sql`).
- Déclenchement automatique (2026-11-10) : pioche hebdomadaire (lundi 8h) et révélation à la deadline (vérifiée toutes les heures, réponses manquantes comptées fausses ; **pas de révélation automatique tant qu'il reste une réponse libre à valider** — décision du 2026-11-10, le code actuel compte encore ces réponses fausses et doit être corrigé) tournent via `pg_cron`, en plus des boutons manuels qui restent disponibles (pioche immédiate, révélation dès que tout le monde a répondu).
- Pas de choix entre plusieurs conjoints en cas de remariage (2026-11-10) : `<conjoint>` se résout sur la première relation `spouse_of` trouvée pour la personne centrale. Suffisant pour le MVP, à revoir si un cas réel de remariage se présente.
- Arbre familial en lecture + ajout de relations et de personnes, pas de suppression/modification (2026-11-10) : une relation ou une personne ajoutée par erreur se corrige directement en base pour l'instant. Toute personne créée depuis cet écran est non centrale (`is_central = false`, `kind = 'profile'`) - devenir centrale reste un choix fait ailleurs (pas d'UI pour ça aujourd'hui).
- Resend reste l'envoyeur d'email (sandbox, pas de domaine acheté) — ne pas reproposer de le désactiver.
- Catalogue de templates géré par nous, pas par les familles, en V1.
- Pas de maximum technique sur le nombre de personnes centrales (recommandation UI : 1 à 4). Une nouvelle personne centrale peut être ajoutée à tout moment, sans gatekeeper.

## Prochains sujets (à choisir, ou proposer autre chose)

- Emails/notifications (nouvelle session, rappels, résultats, relances de validation) + « prise de main ».
- Enrichissement des archives (étape 12) : regroupement par catégorie, auteur/anecdote/date de révélation/taux de bonnes réponses par fait, recherche par mot-clé, frise chronologique.
- Réactions/commentaires sur les faits révélés.
- Score de contribution + relances si un membre n'a rien ajouté.
- Application de la direction visuelle (coloré, bleu-blanc-rouge).
- Fermer les deux fuites résiduelles notées plus haut (type `list`, `facts.answer_value`).
- **Arbre familial (étape 5, à retravailler)** : voir écran 10 dans `docs/ecrans.md`.
  - Affichage organisé comme un arbre généalogique : les enfants sous leurs parents, des traits entre les personnes pour représenter les relations (dans les grandes lignes, pas un vrai logiciel de généalogie).
  - Création des relations : ajouter « enfant » aux choix actuels (« conjoint », « parent »). Même résultat que « parent » dans l'autre sens (`parent_of` avec les deux personnes inversées), mais plus naturel selon le point de vue. Ajouter aussi « frère / sœur » (adelphe) pour lier deux personnes sans connaître leurs parents : nouveau type de relation `sibling_of` (migration nécessaire).
- Vraie capture par paire du lien de parenté créateur ↔ personnes centrales (`relationship_label`), voir « Points à décider ».
- Phase 2 : notifications push, builds natifs iOS/Android.
