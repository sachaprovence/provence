# Provence 360 — Liste complète des placeholders à remplacer

Ce document centralise **tout** ce qui doit être remplacé avant la mise en
ligne définitive du site. Rien de ce qui suit n'est une donnée réelle :
tout a été volontairement laissé en placeholder plutôt qu'inventé.

Cochez chaque ligne au fur et à mesure. Les fichiers indiqués sont ceux du
dossier `squarespace/` (à reporter dans les blocs de code correspondants
sur le site en ligne) ; les mêmes placeholders existent aussi dans les
fichiers `preview/*.html` équivalents.

## 1. Coordonnées de l'entreprise

| Placeholder | Description | Fichiers concernés |
|---|---|---|
| `[REMPLACER_PAR_TELEPHONE]` | Numéro de téléphone professionnel | Toutes les pages (pied de page), 04-home, 09-contact |
| `[REMPLACER_PAR_EMAIL]` | Adresse e-mail de contact | Toutes les pages (pied de page), 04-home, 09-contact, 10-seo-jsonld, 12/13 (légal) |
| Zone d'intervention | Déjà rédigée ("Provence, Avignon, Monteux, Vaucluse et environs") — à ajuster si elle évolue | Toutes les pages |

## 2. Informations légales (mentions légales / confidentialité)

| Placeholder | Description | Fichier |
|---|---|---|
| `REMPLACER_PAR_RAISON_SOCIALE` | Nom légal de l'entreprise | 12-mentions-legales, 13-confidentialite |
| `REMPLACER_PAR_FORME_JURIDIQUE` | SASU, EI, auto-entreprise, etc. | 12-mentions-legales |
| `REMPLACER_PAR_ADRESSE` | Adresse du siège | 12-mentions-legales, 10-seo-jsonld |
| `REMPLACER_PAR_SIRET` | Numéro SIREN/SIRET | 12-mentions-legales |
| `REMPLACER_PAR_DIRECTEUR_PUBLICATION` | Nom du directeur de la publication | 12-mentions-legales |
| `REMPLACER_PAR_HEBERGEUR_SQUARESPACE_OU_AUTRE` | Nom de l'hébergeur (Squarespace, Inc. si applicable) | 12-mentions-legales |
| `REMPLACER_PAR_ADRESSE_HEBERGEUR` | Adresse de l'hébergeur | 12-mentions-legales |
| `REMPLACER_PAR_MENTION_JURIDIQUE_COMPLEMENTAIRE_SI_BESOIN` | Mention complémentaire propriété intellectuelle, si nécessaire | 12-mentions-legales |
| `REMPLACER_PAR_INFORMATIONS_MEDIATION_SI_APPLICABLE` | Coordonnées du médiateur de la consommation, si applicable | 12-mentions-legales |
| `REMPLACER_PAR_DUREE_DE_CONSERVATION` | Durée de conservation des données du formulaire | 13-confidentialite |
| `REMPLACER_PAR_CODE_POSTAL`, `REMPLACER_PAR_VILLE` | Adresse structurée pour le JSON-LD | 10-seo-jsonld |

## 3. Référencement (JSON-LD)

| Placeholder | Description | Fichier |
|---|---|---|
| `REMPLACER_PAR_URL_DU_SITE` | URL finale du site (ex. `https://www.provence360.fr`) | 10-seo-jsonld |
| `REMPLACER_PAR_URL_DU_LOGO` | URL du logo définitif hébergé sur Squarespace | 10-seo-jsonld |
| `REMPLACER_PAR_URL_IMAGE_REPRESENTATIVE` | URL d'une photo représentative de l'activité | 10-seo-jsonld |
| `REMPLACER_PAR_URL_INSTAGRAM_SI_EXISTANT`, `REMPLACER_PAR_URL_FACEBOOK_SI_EXISTANT`, `REMPLACER_PAR_URL_LINKEDIN_SI_EXISTANT` | Réseaux sociaux réels (supprimer la ligne si le réseau n'existe pas) | 10-seo-jsonld |

## 4. Contenus éditoriaux "zones modifiables" (page À propos)

| Placeholder | Description | Fichier |
|---|---|---|
| `REMPLACER_PAR_HISTOIRE_DU_PROJET` | Histoire réelle du projet Provence 360 | 08-a-propos |
| `REMPLACER_PAR_PRESENTATION_FONDATEUR_EQUIPE` | Présentation réelle du fondateur / de l'équipe | 08-a-propos |
| `REMPLACER_PAR_VISION_LONG_TERME` | Vision réelle à long terme de l'entreprise | 08-a-propos |
| `REMPLACER_PAR_PHOTO_EQUIPE_OU_FONDATEUR` | Photographie réelle à intégrer (voir `briefs-images.md`) | 08-a-propos |

## 5. Showroom — visites virtuelles (répété pour les visites 1 à 6, à dupliquer pour en ajouter davantage)

| Placeholder | Description | Fichier |
|---|---|---|
| `REMPLACER_PAR_NOM_DU_LIEU` | Nom réel du lieu / de l'établissement | 06-showroom (cartes + tableau `P360_TOURS`) |
| `REMPLACER_PAR_IMAGE_VISITE_N` | Image de couverture de la visite (voir `briefs-images.md`) | 06-showroom |
| `REMPLACER_PAR_URL_VISITE_N` | URL d'intégration (iframe) fournie par la plateforme de visite virtuelle | 06-showroom |
| `REMPLACER_PAR_TEXTE_ALTERNATIF_N` | Texte alternatif de l'image de couverture | 06-showroom (tableau `P360_TOURS`, champ `alt`) |
| Localisation, catégorie, description de chaque visite | Déjà rédigées comme exemples ("Avignon (exemple)", etc.) — à remplacer par les vraies informations | 06-showroom |

## 6. Visuels génériques

| Placeholder | Description | Fichier |
|---|---|---|
| `REMPLACER_PAR_VISUEL_HERO` | Image/vidéo d'illustration du hero de l'accueil | 04-home |
| `REMPLACER_PAR_IMAGE_SHOWROOM` | Visuel d'aperçu du showroom sur la page d'accueil | 04-home |

## 7. Réalisations / cas clients (page d'accueil)

Les cartes « Projet de démonstration », « Réalisation à venir », « Exemple
de présentation », « Témoignage à ajouter » (section 04-home) sont à
remplacer une par une par de vraies réalisations, au fur et à mesure des
missions menées — jamais par du contenu fictif présenté comme réel.

## 8. Formulaire de contact

Le bloc "ZONE FORMULAIRE" de la page Contact (09-contact) doit être
remplacé par un bloc natif Squarespace "Formulaire" — voir
`README-SQUARESPACE.md`, section correspondante, pour la marche à suivre.

## 9. Logo et identité visuelle

Voir `assets/README-ASSETS.md` pour la procédure complète de remplacement
du symbole et du wordmark temporaires par le logo officiel de Provence 360.
