# Provence 360 — Guide d'installation Squarespace 7.1

Ce guide explique, étape par étape et sans connaissance avancée en
développement, comment installer le site Provence 360 dans Squarespace 7.1.
Il complète (et ne remplace pas) les commentaires présents en tête de
chaque fichier du dossier `squarespace/`.

---

## Sommaire

1. [Quel type de site Squarespace utiliser](#1-quel-type-de-site-squarespace-utiliser)
2. [Pages à créer](#2-pages-à-créer)
3. [Contenu à coller dans chaque page](#3-contenu-à-coller-dans-chaque-page)
4. [Où placer le CSS](#4-où-placer-le-css)
5. [Où placer le JavaScript](#5-où-placer-le-javascript)
6. [Où placer le JSON-LD (référencement)](#6-où-placer-le-json-ld-référencement)
7. [Choisir votre stratégie de navigation](#7-choisir-votre-stratégie-de-navigation)
8. [Ajouter / modifier une visite dans le showroom](#8-ajouter--modifier-une-visite-dans-le-showroom)
9. [Ajouter une nouvelle réalisation (accueil)](#9-ajouter-une-nouvelle-réalisation-accueil)
10. [Changer une image](#10-changer-une-image)
11. [Modifier une couleur](#11-modifier-une-couleur)
12. [Modifier les textes](#12-modifier-les-textes)
13. [Connecter les boutons aux bonnes pages](#13-connecter-les-boutons-aux-bonnes-pages)
14. [Intégrer un formulaire Squarespace natif](#14-intégrer-un-formulaire-squarespace-natif)
15. [Paramétrer la navigation mobile](#15-paramétrer-la-navigation-mobile)
16. [Vérifier le rendu après publication](#16-vérifier-le-rendu-après-publication)
17. [Fonctions nécessitant un forfait Squarespace spécifique](#17-fonctions-nécessitant-un-forfait-squarespace-spécifique)
18. [Solutions de repli si JavaScript ou les iframes sont indisponibles](#18-solutions-de-repli-si-javascript-ou-les-iframes-sont-indisponibles)

---

## 1. Quel type de site Squarespace utiliser

- Utilisez un site **Squarespace version 7.1** (l'éditeur "fluid engine" /
  blocs modernes). Le template de départ importe peu : ce site ne dépend
  d'aucune mise en page ou section propre à un template précis, puisque
  chaque page est construite à partir de blocs "Code" autonomes.
- Choisissez de préférence un template simple, sans effets visuels lourds
  déjà intégrés (parallax, curseurs personnalisés), pour éviter les
  conflits visuels avec le design fourni.
- Un forfait payant Squarespace est nécessaire pour :
  - utiliser l'injection de code personnalisé (CSS/JS), et
  - utiliser des blocs "Code" sur vos pages.
  Voir [section 17](#17-fonctions-nécessitant-un-forfait-squarespace-spécifique).

## 2. Pages à créer

Créez les pages suivantes dans **Pages > Pages principales** (navigation
principale), avec les URL suggérées :

| Page | URL suggérée |
|---|---|
| Accueil | `/` |
| Services | `/services` |
| Showroom 3D | `/showroom-3d` |
| Notre méthode | `/notre-methode` |
| À propos | `/a-propos` |
| Contact | `/contact` |

Ajoutez également deux pages secondaires (souvent classées "Non liées" ou
dans le pied de page uniquement) :

| Page | URL suggérée |
|---|---|
| Mentions légales | `/mentions-legales` |
| Politique de confidentialité | `/politique-de-confidentialite` |

Si vous utilisez des URL différentes, pensez à mettre à jour tous les liens
internes (`href="/services"`, etc.) dans chaque fichier `squarespace/0X-*.html`.

## 3. Contenu à coller dans chaque page

Pour chaque page créée, ajoutez **un seul bloc "Code"** couvrant toute la
largeur de la page, puis collez l'intégralité du fichier correspondant :

| Page | Fichier à coller |
|---|---|
| Accueil | `squarespace/04-home-code-block.html` |
| Services | `squarespace/05-services-code-block.html` |
| Showroom 3D | `squarespace/06-showroom-code-block.html` |
| Notre méthode | `squarespace/07-methode-code-block.html` |
| À propos | `squarespace/08-a-propos-code-block.html` |
| Contact | `squarespace/09-contact-code-block.html` |
| Mentions légales | `squarespace/12-mentions-legales-code-block.html` |
| Politique de confidentialité | `squarespace/13-confidentialite-code-block.html` |

Dans l'éditeur Squarespace : **Ajouter un bloc > Code**, collez le contenu
du fichier, puis enregistrez. Désactivez le titre de page natif si votre
template l'affiche automatiquement au-dessus du contenu (chaque bloc de
code contient déjà son propre titre `<h1>`), via les réglages de la page
(icône engrenage > Options SEO / Affichage du titre).

## 4. Où placer le CSS

1. Allez dans **Design > CSS personnalisé** (ou **Accueil > Design >
   Modifications avancées > CSS personnalisé** selon la version de
   l'éditeur).
2. Collez l'intégralité du fichier `squarespace/01-global-custom-css.css`.
3. Enregistrez. Ce fichier contient toutes les couleurs, tailles,
   espacements et durées d'animation du site sous forme de variables CSS
   (bloc `:root` en haut du fichier) — voir [section 11](#11-modifier-une-couleur).

## 5. Où placer le JavaScript

1. Allez dans **Réglages > Avancé > Injection de code**.
2. Dans le champ **Pied de page (Footer)**, collez l'intégralité du fichier
   `squarespace/03-footer-code-injection.html` (balises `<script>` incluses).
3. Dans le champ **En-tête (Header)**, collez l'intégralité du fichier
   `squarespace/02-header-code-injection.html` (chargement des polices).
4. Enregistrez. Ce script est unique, isolé (`window.P360`), et gère : le
   menu mobile, l'en-tête compact au défilement, les apparitions au
   défilement, l'accordéon FAQ et le showroom 3D.

## 6. Où placer le JSON-LD (référencement)

Collez le contenu de `squarespace/10-seo-jsonld.html` **à un seul endroit** :

- soit à la suite du contenu du champ **Injection de code > En-tête**
  (s'applique alors à tout le site), soit
- dans l'injection de code spécifique à la page d'accueil, si votre forfait
  le permet (Réglages avancés de la page > Injection de code).

Avant de le coller, remplacez toutes les valeurs `[REMPLACER_PAR_...]` par
les informations réelles de l'entreprise (voir
`content/placeholders-a-remplacer.md`).

## 7. Choisir votre stratégie de navigation

Chaque bloc de page (`04` à `09`, `12`, `13`) inclut **son propre en-tête**
(`<header class="p360-header">`) et **son propre pied de page**
(`<footer class="p360-footer">`), pour un rendu fidèle à la prévisualisation
sur toutes les pages sans dépendre d'un template Squarespace particulier.

Deux options :

- **Option A — recommandée, déjà activée par défaut.** Gardez l'en-tête et
  le pied de page fournis dans les blocs de code. Le fichier
  `squarespace/01-global-custom-css.css` masque automatiquement l'en-tête
  et le pied de page natifs de Squarespace (règle `#header, #footer {
  display: none !important; }`, section 15bis du fichier CSS) pour éviter
  tout doublon. Avantage : rendu identique à la prévisualisation locale,
  sans réglage supplémentaire. Inconvénient : pour changer un lien de
  navigation, il faut le modifier dans chacun des 8 fichiers de blocs de
  code (repérez le commentaire `<!-- NAVIGATION -->` si présent, ou la
  balise `<nav class="p360-nav">`).
- **Option B — pour les sites gérés davantage depuis l'interface
  Squarespace.** Si vous préférez piloter votre navigation depuis
  **Pages > Navigation** sans toucher au code : supprimez la règle
  `#header, #footer { display: none !important; }` du CSS, puis retirez
  les balises `<header class="p360-header">…</header>` et
  `<footer class="p360-footer">…</footer>` de chaque bloc de code (gardez
  uniquement le contenu de `<main>`). Il faudra alors ajuster manuellement
  le CSS de l'en-tête natif de votre template pour se rapprocher de la
  direction artistique du site (couleurs, typographie — voir
  `squarespace/01-global-custom-css.css`).

## 8. Ajouter / modifier une visite dans le showroom

Toutes les instructions détaillées sont en tête du fichier
`squarespace/06-showroom-code-block.html`. En résumé :

1. Repérez le tableau JavaScript `window.P360_TOURS` en bas du fichier.
2. Pour **modifier** une visite existante, changez les valeurs de l'objet
   correspondant (`title`, `category`, `location`, `description`,
   `coverImage`, `embedUrl`, `externalUrl`, `alt`).
3. Pour **remplacer une URL de visite 3D** : remplacez la valeur
   `embedUrl` (et `externalUrl`, généralement identique ou une variante
   sans paramètres d'intégration) par l'URL d'intégration fournie par
   votre plateforme (Matterport, Kuula, etc. — copiez le lien "Partager"
   ou "Intégrer" depuis leur interface).
4. Mettez à jour la carte HTML correspondante un peu plus haut dans le
   fichier (attribut `href` du bloc `<a class="p360-tour-card" …>` doit
   pointer vers la même URL que `externalUrl`, pour que la visite reste
   accessible même si JavaScript ne s'exécute pas).
5. Pour **ajouter** une nouvelle visite : dupliquez un objet du tableau et
   une carte `<a class="p360-tour-card">…</a>`, en donnant un `id` unique
   (ex. `tour-7`) et en choisissant une catégorie parmi : `immobilier`,
   `hebergement`, `restauration`, `tourisme`, `evenementiel`, `commerces`.

## 9. Ajouter une nouvelle réalisation (accueil)

Dans `squarespace/04-home-code-block.html`, repérez la section
"Réalisations et démonstrations" (`<!-- RÉALISATIONS / CAS CLIENTS -->`).
Dupliquez une carte `<article class="p360-card p360-card--status">…`,
remplacez le badge (`p360-card__status-badge`) par un intitulé honnête
(par exemple le nom du client si votre accord le permet, ou gardez
« Réalisation à venir » tant que le projet n'est pas finalisé), puis
complétez le titre et la description. Ne présentez jamais un projet de
démonstration comme une réalisation client réelle.

## 10. Changer une image

- Toutes les images sont actuellement des zones de couverture stylisées
  (dégradés CSS) en attendant les vrais visuels — voir
  `content/briefs-images.md` pour le brief de chaque image manquante.
- Pour ajouter une vraie image : importez-la dans la bibliothèque d'images
  Squarespace (glisser-déposer dans un bloc image, puis copier l'URL
  générée via clic droit > "Copier l'adresse de l'image", ou utiliser le
  panneau des fichiers du site), puis remplacez le placeholder
  correspondant (`REMPLACER_PAR_IMAGE_VISITE_1`, `REMPLACER_PAR_VISUEL_HERO`,
  etc.) par cette URL dans le fichier HTML concerné.
- Respectez le ratio indiqué dans le brief pour chaque emplacement, afin
  d'éviter un saut de mise en page.

## 11. Modifier une couleur

Toutes les couleurs sont centralisées en haut du fichier
`squarespace/01-global-custom-css.css`, dans le bloc `:root` (section 1,
"VARIABLES GLOBALES"). Exemple :

```css
--p360-color-terracotta: #B15C31; /* couleur d'accent principal (boutons) */
--p360-color-olive: #6C7455;      /* accent secondaire */
--p360-color-anthracite: #2A2823; /* couleur des titres */
```

Modifiez uniquement la valeur hexadécimale après le nom de variable : la
nouvelle couleur s'appliquera automatiquement partout où elle est utilisée
sur le site (boutons, titres, bordures, etc.), sans avoir à chercher
chaque occurrence dans le code.

## 12. Modifier les textes

- Le fichier `content/textes-site.md` contient l'intégralité des textes du
  site, organisés par page et par section : modifiez-le en premier pour
  garder une trace claire des changements de contenu.
- Reportez ensuite chaque modification dans le fichier HTML correspondant
  (`squarespace/0X-*.html`), en recherchant le texte à remplacer.
- Les titres sont dans des balises `<h1>`, `<h2>`, `<h3>` ; les paragraphes
  dans des balises `<p>`. Aucune balise ne doit être supprimée en modifiant
  un texte, seul le contenu entre les balises doit changer.

## 13. Connecter les boutons aux bonnes pages

Chaque bouton est un lien HTML classique (`<a class="p360-btn …" href="…">`).
Pour changer sa destination, modifiez uniquement la valeur de l'attribut
`href`. Les boutons "Demander un devis" et "Planifier une démonstration"
pointent par défaut vers `/contact` : adaptez si vous préférez, par
exemple, un lien direct vers un créneau de réservation externe une fois
disponible.

## 14. Intégrer un formulaire Squarespace natif

Ce projet ne fournit **volontairement aucun formulaire fonctionnel** (pas
de serveur, pas de service d'envoi configuré). Sur la page Contact :

1. Repérez la zone `<!-- ZONE FORMULAIRE -->` dans
   `squarespace/09-contact-code-block.html` (un bloc visuel non fonctionnel
   y est déjà présent à titre d'aperçu de mise en page).
2. Dans l'éditeur Squarespace, ajoutez un bloc natif **"Formulaire"** juste
   après cette zone (ou supprimez l'aperçu non fonctionnel et mettez le
   bloc natif à la place).
3. Recréez les champs suivants dans le bloc natif : Nom, Entreprise,
   Adresse e-mail, Téléphone, Type de lieu (champ à choix, menu déroulant),
   Localisation, Surface approximative, Date souhaitée, Message (texte
   long).
4. Dans les réglages du bloc Formulaire, configurez la destination des
   réponses (adresse e-mail, ou stockage dans **Contacts Squarespace**).
5. Testez l'envoi une fois publié (voir [section 16](#16-vérifier-le-rendu-après-publication)).

## 15. Paramétrer la navigation mobile

Le menu mobile est entièrement géré par le CSS et le script fournis :
aucun réglage Squarespace supplémentaire n'est nécessaire si vous avez
gardé l'Option A de la [section 7](#7-choisir-votre-stratégie-de-navigation).
Le bouton "burger" (☰) apparaît automatiquement sous 900 px de largeur et
ouvre un menu plein écran listant les 6 pages principales, avec le bouton
"Demander un devis" en bas. Si vous ajoutez ou retirez une page, dupliquez
ou supprimez la ligne `<li><a class="p360-nav__link" href="…">…</a></li>`
correspondante dans **chacun** des 8 fichiers de blocs de code.

## 16. Vérifier le rendu après publication

Après publication, vérifiez systématiquement :

1. Que chaque page affiche bien son contenu (pas de bloc de code vide ou
   en erreur — Squarespace affiche un message d'erreur visible dans
   l'éditeur si le code contient une faute de frappe bloquante).
2. Que le menu mobile s'ouvre et se ferme correctement sur un vrai
   téléphone (pas seulement en réduisant la fenêtre du navigateur).
3. Que la page Showroom 3D charge bien une visite au clic sur "Charger la
   visite 3D", avec une vraie URL d'intégration.
4. Que le formulaire de contact natif envoie bien un test à l'adresse
   configurée.
5. Qu'aucune erreur n'apparaît dans la console du navigateur (touche F12
   > onglet "Console").
6. Que les liens du pied de page vers "Mentions légales" et "Politique de
   confidentialité" fonctionnent.

## 17. Fonctions nécessitant un forfait Squarespace spécifique

- **Injection de code personnalisé (CSS/JS)** et **blocs "Code"** :
  nécessitent un forfait Squarespace payant (les forfaits gratuits/essai
  peuvent restreindre ces fonctions — vérifiez l'offre en cours sur
  squarespace.com).
- **Injection de code par page** (utilisée en option pour le JSON-LD,
  [section 6](#6-où-placer-le-json-ld-référencement)) : disponible selon
  le forfait ; à défaut, utilisez l'injection de code globale (en-tête du
  site entier).
- **Bloc "Formulaire"** natif : disponible sur la plupart des forfaits
  Squarespace 7.1 ; le nombre de soumissions ou certaines intégrations
  (paiement, automatisations) peuvent dépendre du forfait.
- **Bannière de consentement cookies** native : disponible selon le
  forfait et la région ciblée — voir `squarespace/11-cookie-and-embeds-notes.md`.

## 18. Solutions de repli si JavaScript ou les iframes sont indisponibles

- **JavaScript désactivé** : chaque bloc de page inclut un
  `<noscript><style>…</style></noscript>` qui neutralise les animations
  d'apparition, force le menu mobile à rester visible en liste statique et
  déplie les accordéons FAQ. Sur la page Showroom 3D, les cartes de visite
  sont de vrais liens HTML (`<a href="…">`) qui continuent de fonctionner
  (ouverture dans un nouvel onglet vers la plateforme externe) même sans
  JavaScript.
- **Iframe bloquée ou plateforme indisponible** : chaque visite propose un
  bouton "Ouvrir la visite dans un nouvel onglet" en solution de secours,
  qui s'affiche automatiquement si le chargement échoue ou prend trop de
  temps (au-delà de 15 secondes).
- **Injection de code désactivée sur votre forfait** : dans ce cas précis,
  les animations, le menu mobile et le showroom interactif ne
  fonctionneront pas. Le contenu textuel reste néanmoins lisible ; il est
  toutefois fortement recommandé de passer à un forfait supportant
  l'injection de code pour profiter de l'ensemble des fonctionnalités
  prévues dans ce projet.
