# Stack technique

## Frontend

- **Expo (React Native + Expo Router)**, TypeScript. Un seul codebase : web pendant le développement/test, builds iOS/Android natifs plus tard via EAS Build. Choisi pour éviter une réécriture complète de l'UI quand les apps mobiles seront publiées.
- **NativeWind** pour le style (équivalent Tailwind en React Native).

## Backend

- **Supabase** :
  - Postgres pour les données.
  - Auth par **magic link email** (pas de mot de passe à gérer).
  - **Row Level Security (RLS)** pour isoler les données par famille.
  - **Edge Functions + pg_cron** pour la logique planifiée (création de session hebdomadaire, relances, clôture).

## Notifications

- **V1 (phase web)** : email (Resend, ou SMTP Supabase) pour invitations, nouvelles questions, rappels, résultats.
- **Phase 2 (une fois les apps natives publiées)** : notifications push via **Expo Notifications**, email gardé comme canal de secours.

## Déploiement

- Export web Expo déployé sur Vercel (ou EAS Hosting) pendant le développement.
- **EAS Build** pour les builds iOS/Android natifs quand le projet sera prêt pour les stores.

## Pourquoi pas Next.js

Comme Expo Router sait aussi servir une version web, Next.js n'est pas nécessaire : un seul framework (Expo) couvre web + natif, ce qui évite de maintenir deux UIs différentes.
