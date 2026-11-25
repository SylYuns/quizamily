# RGPD et données personnelles

Première analyse du 2026-11-25, faite à la demande de Sylvain. **Ce n'est pas un avis juridique** : à faire relire par un juriste (ou un DPO) avant d'ouvrir l'appli au public. Voir aussi `concept.md`, « Confidentialité et confiance », et `roadmap.md`, « Sécurité des données et confiance ».

## 1. « Ce sont les utilisateurs qui créent les infos : l'appli n'est responsable de rien ? »

**Non.** Il faut distinguer deux choses.

- **Les utilisateurs**, eux, sont en grande partie hors du RGPD. Un particulier qui parle de sa famille dans un cadre purement privé relève de l'**exemption domestique** (article 2 et considérant 18 du RGPD).
- **L'appli n'en profite pas.** Le même considérant 18 précise que le RGPD **reste applicable aux responsables du traitement qui fournissent les moyens** de traiter des données pour ces activités personnelles. L'éditeur de Quizamily décide pourquoi et comment les données sont traitées (tables, pioche, révélation, archive…). Il est donc **responsable de traitement** pour les données des comptes **et** pour les souvenirs que les utilisateurs saisissent.
- **Jurisprudence récente** : dans l'arrêt **Russmedia** (CJUE, C-492/23, 2 décembre 2025), la Cour a jugé que l'exploitant d'une place de marché en ligne est **responsable de traitement des données personnelles contenues dans les annonces publiées par ses utilisateurs**. Il **ne peut pas échapper à ses obligations RGPD en invoquant le statut d'hébergeur**. Pour les **données sensibles**, il doit les repérer avant publication, vérifier que l'auteur est la personne concernée, et à défaut s'assurer de son consentement explicite. Ces annonces étaient publiques, alors que Quizamily est un cercle fermé : le risque y est plus faible, mais le principe de responsabilité est le même.
- **Le statut d'hébergeur** (loi LCEN de 2004, désormais le règlement européen DSA) est **une autre question**. Il concerne la responsabilité pour un **contenu illicite** (diffamation, atteinte à la vie privée…). L'hébergeur n'est pas responsable s'il ne savait pas, et s'il retire promptement le contenu dès qu'on le lui signale. Il faut donc **un moyen de signaler un contenu et de le faire retirer**.

## 2. Les personnes dont on parle

| Qui | Le RGPD s'applique ? | Conséquences |
|---|---|---|
| **Joueurs** (ont un compte) | Oui | Informés à l'inscription, droits exercés depuis l'appli : voir, corriger, exporter, supprimer. |
| **Grands-parents vivants sans compte** (profils, personnes centrales) | **Oui, ce sont des personnes concernées à part entière**, même sans compte | Voir ci-dessous. |
| **Personnes décédées** | **Non** (CNIL) | Mais la loi Informatique et Libertés (article 85) prévoit les directives post-mortem et des **droits pour les héritiers**. Les proches peuvent agir en cas d'atteinte à la mémoire ou à l'honneur du défunt. Un souvenir sur un défunt peut aussi en dire long sur des **vivants** (« son fils est né avant le mariage »). |

### Les grands-parents vivants sans compte

- **Base légale** : vraisemblablement l'**intérêt légitime** (article 6.1.f) : faire vivre la mémoire familiale dans un cercle fermé. Il faut le documenter par une mise en balance entre cet intérêt et les droits de la personne. Le consentement explicite de chaque grand-parent serait plus sûr, mais lourd à recueillir.
- **Information** (article 14 : données recueillies auprès de quelqu'un d'autre que la personne) : la personne doit être informée, sauf si c'est impossible ou demande des efforts disproportionnés. Piste simple et chaleureuse : à la création d'un profil, une case **« Mamie est au courant et d'accord »**, et un **petit message à lui transmettre** (ou à imprimer), du genre « Ta famille joue à Quizamily et y garde tes souvenirs ; tu peux demander à les voir, les corriger ou les retirer ».
- **Droits** : accès, rectification, effacement, opposition. Il faut un **moyen simple de les exercer**, même pour quelqu'un sans compte : une adresse de contact, une demande faite par un proche en son nom, et **« réclamer son profil »** (déjà construit) pour qu'elle voie et gère ses souvenirs elle-même si elle rejoint l'appli.
- **Retrait d'un souvenir** : un membre de la famille doit pouvoir **signaler** un souvenir qui gêne, et le créateur de la famille ou l'auteur doit pouvoir le retirer. Les corrections existent déjà, le retrait non.

## 3. Données sensibles (article 9)

La santé, la religion, les opinions politiques, l'orientation sexuelle, l'origine ethnique… ont une protection renforcée.

- **Catalogue** : vérifié le 2026-11-25, aucun des 32 modèles de questions ne porte sur ces sujets. **À garder ainsi** : pas de question sur la cause d'un décès, une maladie, une religion, un vote…
- **Anecdotes et commentaires** (texte libre) : ils peuvent en contenir. Prévoir une **phrase de rappel discrète** au moment de la saisie (« Pas d'informations de santé ou trop intimes sans l'accord de la personne »), l'interdiction dans les conditions d'utilisation, et le signalement et retrait (point 2).

## 4. Ce que l'éditeur doit mettre en place (liste de travail)

1. **Politique de confidentialité**, en mots simples : quelles données, pourquoi, combien de temps, où, qui y a accès, droits et contact.
2. **Conditions d'utilisation** : l'utilisateur s'engage à ne partager que ce que les personnes concernées accepteraient, sans données sensibles ni contenus blessants. Elles prévoient aussi le signalement et le retrait.
3. **Registre des traitements** : un document simple, obligatoire.
4. **Sous-traitant** : Supabase. Vérifier la **région d'hébergement (Union européenne)**, l'accord de traitement des données (DPA) de Supabase et la liste de ses propres sous-traitants. Même chose pour l'envoi d'e-mails (Resend).
5. **Sécurité** (article 32) : règles d'accès par famille (déjà en place), relecture de sécurité, sauvegardes. Vérifier aussi le **lien d'invitation** (voir `roadmap.md`).
6. **Violation de données** : procédure pour prévenir la CNIL **sous 72 heures** et les personnes concernées si le risque est élevé.
7. **Durées de conservation** : ce qui arrive aux comptes inactifs et aux familles abandonnées.
8. **Droits dans l'appli** : export des souvenirs, suppression du compte, suppression de la famille par son créateur.
9. **Mineurs** : en France, un mineur peut consentir seul à partir de **15 ans** pour ce type de service. En dessous, il faut l'accord d'un parent quand la base légale est le consentement. À prévoir si des petits-enfants jeunes s'inscrivent.
10. **Avant l'ouverture au public** : relecture par un juriste ou un DPO, et analyse d'impact (AIPD) si le juriste l'estime nécessaire, vu le caractère intime des données.

## Sources

- RGPD, considérant 18 (exemption domestique et fournisseurs de moyens) : https://gdpr-text.com/fr/read/recital-18
- CJUE, Russmedia, C-492/23, 2 décembre 2025, communiqué de presse : https://curia.europa.eu/jcms/upload/docs/application/pdf/2025-12/cp250150en.pdf
- CNIL, mort numérique et droits des héritiers : https://www.cnil.fr/fr/mort-numerique-ou-eternite-virtuelle-que-deviennent-vos-donnees-apres-la-mort-0
- CCI Paris Île-de-France, responsabilité des hébergeurs : https://www.entreprises.cci-paris-idf.fr/fiches-pratiques/la-responsabilite-des-hebergeurs
- Article 14 RGPD (données non collectées auprès de la personne) : https://www.donneespersonnelles.fr/article-14-rgpd
