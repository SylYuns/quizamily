# Roadmap

## Étapes de réalisation

1. Setup Expo + Supabase, schéma DB + RLS.
2. Auth + création famille + désignation des personnes centrales + relations de départ.
3. Invitations (lien) + flux de rejoindre une famille.
4. Catalogue de templates + formulaire d'ajout de fait (champs guidés par type).
5. Mini arbre familial (vue simple des personnes + relations).
6. Logique de pioche pondérée (fraîcheur + répartition auteurs) + Edge Function de création de session.
7. Emails (nouvelle session, rappel, résultats).
8. Écran de réponse au quiz + logique du seuil de déclenchement du premier quiz.
9. Révélation automatique à la deadline, calcul des scores (4 états).
10. Réactions/commentaires sur les faits révélés.
11. Mécanisme de correction + recalcul rétroactif des scores.
12. Archive familiale consultable + score de contribution + relances.
13. Polish, puis phase 2 : push notifications + builds iOS/Android.

## Scope du premier MVP partageable (test avec 2-3 personnes)

Volontairement réduit par rapport à la liste complète ci-dessus :

**Inclus** : auth + création famille + invite, création des personnes centrales (relations simplifiées), un catalogue réduit de ~15-20 templates codés en dur (pas de back-office d'édition), ajout de faits, pioche + session de quiz (version simple au début, pas besoin du roulement pondéré sophistiqué dès le jour 1), réponse, révélation (scores + contexte), emails (nouvelle question + résultats).

**Reporté après le premier test** : réactions/commentaires, mécanisme de correction, relances de contribution, vue arbre familial, notifications push, builds natifs iOS/Android (le web suffit pour tester avec 2-3 personnes).

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

## Hypothèses ouvertes

- Pas de maximum technique strict sur le nombre de personnes centrales (recommandation UI : rester à 1-4).
- Une nouvelle personne centrale peut être ajoutée à tout moment, sans gatekeeper.
- Catalogue de templates géré par nous, pas par les familles, en V1.
