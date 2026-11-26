# Faire tester l'appli à quelques personnes extérieures

Recherche du 2026-11-26, demandée par Sylvain. Le besoin : 4 ou 5 proches, amis et membres de la famille, sur leurs téléphones (iPhone et Android), avec un budget de 50 € maximum pour la phase de test. Les prix et les conditions des services évoluent : à revérifier au moment de s'y mettre.

## Le point bloquant d'abord : les e-mails de connexion

La connexion se fait par lien magique (`signInWithOtp`, `src/components/login-form.tsx`). Aujourd'hui, ces e-mails **n'arriveront pas chez les testeurs** :

- le service d'e-mail par défaut de Supabase n'envoie qu'aux adresses de l'équipe du projet, et au plus 2 messages par heure ;
- Resend, en mode test sans domaine vérifié, n'envoie qu'à l'adresse du propriétaire du compte (voir `roadmap.md`, « Points à décider »).

**Il faut donc un nom de domaine** : environ 5 € HT la première année pour un .fr chez OVHcloud, et environ 8,50 € HT pour un .com. Il faut ensuite le vérifier dans Resend (quelques enregistrements DNS à ajouter), puis renseigner Resend comme serveur SMTP dans Supabase (Authentication → SMTP). Le palier gratuit de Resend (3 000 e-mails par mois, 100 par jour) suffit largement. La décision de ne pas acheter de domaine était prévue « à rediscuter le moment venu » : c'est le moment.

## Les solutions

| Solution | iPhone | Android | Coût | Difficulté pour les testeurs |
|---|---|---|---|---|
| **A. Version web** (lien + « Ajouter à l'écran d'accueil ») | oui | oui | 0 € | très simple |
| **B. APK Android** (distribution interne EAS) | non | oui | 0 € | moyenne (installation hors Play Store) |
| **C. Google Play, test interne** | non | oui | 25 $ une fois (~23 €) | simple |
| **D. iPhone natif** (TestFlight ou ad hoc) | oui | non | 99 € par an | simple |
| ~~E. Expo Go~~ | — | — | — | plus possible : depuis mai 2026, Expo Go n'ouvre que les projets de son propre compte ou de son organisation |

### A. Version web (recommandée)

L'appli fonctionne déjà sur le web : c'est là qu'elle est testée depuis le début, et la roadmap prévoyait un « déploiement web partageable » pour le premier test.

1. Construire le site : `npx expo export -p web` (sortie statique, `web.output = "single"` dans `app.json`).
2. L'héberger gratuitement, au choix :
   - **EAS Hosting** (`eas deploy`) : gratuit jusqu'à 100 000 requêtes par mois, adresse en `.expo.app`, mais pas de domaine personnalisé sur l'offre gratuite ;
   - **Netlify, Vercel ou Cloudflare Pages** : gratuits, et ils acceptent le domaine acheté pour les e-mails (par exemple `quizamily.fr`).
3. Dans Supabase → Authentication → URL Configuration : mettre l'adresse du site en « Site URL » et dans les redirections autorisées, sinon le lien magique renverra vers une mauvaise adresse.
4. Les testeurs ouvrent le lien sur leur téléphone, puis « Partager → Sur l'écran d'accueil » (iPhone) ou « Ajouter à l'écran d'accueil » (Android) : l'appli a alors son icône.

Limites :
- pas de notifications push, mais elles ne sont pas prévues pour ce test : ce sont les e-mails ;
- **à vérifier sur iPhone** : une appli web ajoutée à l'écran d'accueil ne partage pas sa session avec Safari. Le lien magique reçu par e-mail s'ouvre dans Safari, donc la personne y est connectée, mais pas dans l'icône de l'écran d'accueil. Parade simple : envoyer aussi **un code à 6 chiffres** dans l'e-mail (Supabase le permet), que l'on tape dans l'appli ;
- les gestes de l'arbre n'ont été essayés qu'à la souris : à tester sur un vrai téléphone avant d'inviter les testeurs.

### B. APK Android par EAS (gratuit)

1. Ajouter `android.package` dans `app.json` (par exemple `fr.quizamily.app`) et un profil `preview` dans `eas.json` avec `"distribution": "internal"`.
2. `eas build -p android --profile preview`. L'offre gratuite d'EAS permet 15 constructions Android par mois.
3. Envoyer le lien de téléchargement. Le testeur accepte l'avertissement « source inconnue », puis installe.
4. Mises à jour : reconstruire, ou utiliser EAS Update (gratuit jusqu'à 1 000 utilisateurs actifs par mois).

Il faut aussi régler le **lien de retour du lien magique** vers l'appli (schéma d'URL ou lien universel), ce que la version web n'exige pas. Ça ne vaut la peine que si un testeur Android veut une « vraie » appli.

### C. Google Play, test interne (~23 €)

1. Créer un compte développeur Google Play : 25 $ une seule fois.
2. Construire un AAB (`eas build -p android`) et l'envoyer sur la piste « Test interne ».
3. Ajouter les adresses Gmail des testeurs. Ils installent depuis le Play Store via un lien.

Le test interne n'a **pas** l'obligation des « 12 testeurs pendant 14 jours », qui ne concerne que le passage en production pour un compte personnel. C'est un investissement utile plus tard, mais pas indispensable maintenant.

### D. iPhone natif (99 € par an)

TestFlight et la distribution ad hoc (100 iPhone par an, en enregistrant l'identifiant de chaque appareil) exigent l'Apple Developer Program à 99 € par an. Ça dépasse le budget : pour les iPhone, rester sur la version web.

## Autres points à prévoir pour le test

- **Supabase gratuit se met en pause après 7 jours de faible activité.** Avec une question par semaine, une semaine calme peut suffire à l'endormir. Un e-mail prévient une semaine avant, et on le relance depuis le tableau de bord. Parade gratuite : une petite requête automatique quotidienne, par exemple une tâche GitHub Actions planifiée. L'offre payante qui supprime la pause coûte 25 $ par mois.
- **Réactiver les tâches planifiées** (pioche du lundi, révélation), désactivées pour la phase de test (étape 11).
- **Lien d'invitation** : réutilisable et sans expiration, et la validation des nouveaux venus n'est pas construite. Acceptable avec des proches, mais il ne faut pas publier le lien.
- **RGPD** : pour un test entre proches, une courte note d'information suffit (voir `rgpd.md`). Le gros du chantier est pour l'ouverture au public.

## Recommandation

**Version web + nom de domaine (pour les e-mails, et le site) : environ 6 à 10 € TTC en tout.** Tout le monde l'utilise, iPhone comme Android, sans rien installer depuis un magasin. Si un testeur Android tient à une vraie appli, on lui fait un APK gratuit (B). On garde Google Play (C) et Apple (D) pour plus tard.

## Sources

- Expo, offres et limites gratuites (EAS Build, Update, Hosting) : https://expo.dev/pricing
- Expo, distribution interne (APK, ad hoc iOS) : https://docs.expo.dev/build/internal-distribution/
- Expo, changement de chargement des projets dans Expo Go (mai 2026) : https://expo.dev/changelog/expo-go-loading-changes-may-2026
- Expo, publier un site web : https://docs.expo.dev/guides/publishing-websites/
- Google Play, obligations de test des nouveaux comptes personnels : https://support.google.com/googleplay/android-developer/answer/14151465
- Apple, comparer les abonnements développeur : https://developer.apple.com/fr/support/compare-memberships/
- Supabase, serveur d'e-mail personnalisé (SMTP) : https://supabase.com/docs/guides/auth/auth-smtp
- Supabase, mise en pause des projets gratuits : https://supabase.com/docs/guides/platform/free-project-pausing
- Resend, tarifs : https://resend.com/docs/knowledge-base/what-is-resend-pricing
- Resend, configurer Supabase avec son domaine : https://resend.com/blog/how-to-configure-supabase-to-send-emails-from-your-domain
- OVHcloud, prix des noms de domaine : https://www.ovhcloud.com/fr/domains/cheap-domain-name/
