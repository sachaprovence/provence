# Provence 360 — Rapport final

## 1. Résumé de la direction artistique

Le site adopte une identité « Provence contemporaine et architecturale » :
pierre calcaire claire, blanc cassé, sable, terre cuite maîtrisée (accent
principal), vert olive discret (accent secondaire), anthracite et noir
légèrement chaud pour les sections sombres. Typographie éditoriale
(Fraunces) pour les titres, sans-serif très lisible (Inter) pour le texte
courant. Aucune référence provençale folklorique (pas de lavande, pas de
cigale, pas de couleurs criardes). Rythme vertical généreux, hiérarchie
typographique nette, transitions discrètes (apparitions au défilement,
soulignements animés, en-tête compact). Toutes les couleurs, tailles,
espacements et durées d'animation sont centralisés dans des variables CSS
(`squarespace/01-global-custom-css.css`, section 1).

## 2. Architecture créée

6 pages principales + 2 pages légales, navigation identique sur toutes les
pages (Accueil, Services, Showroom 3D, Notre méthode, À propos, Contact,
CTA « Demander un devis ») :

- **Accueil** — hero, bandeau de bénéfices, présentation du service,
  showroom mis en avant, secteurs accompagnés, méthode en 4 étapes,
  livrables, réalisations (démonstration), appel à l'action final.
- **Services** — 4 solutions détaillées (pour qui / problème / réalisation
  / livrables / bénéfice / CTA), mention « Sur devis ».
- **Showroom 3D** — lecteur principal, filtres par catégorie, grille de
  visites, données centralisées dans un tableau JS documenté.
- **Notre méthode** — 9 étapes, de la prise de contact à l'accompagnement.
- **À propos** — zones modifiables (histoire, fondateur/équipe, zone
  d'intervention, vision), aucune biographie inventée.
- **Contact** — coordonnées, zone formulaire (à remplacer par un bloc
  Squarespace natif), FAQ complète (7 questions) en accordéon accessible.
- **Mentions légales** et **Politique de confidentialité** — pages
  structurelles bonus (non explicitement demandées dans la liste de
  fichiers, mais nécessaires car le pied de page y renvoie sur toutes les
  pages), entièrement en placeholders.

## 3. Fonctionnalités développées

- En-tête sticky qui se compacte au défilement (transition fluide).
- Menu mobile plein écran, accessible (Échap, focus renvoyé, `aria-expanded`).
- Apparitions progressives au défilement (Intersection Observer),
  respectant `prefers-reduced-motion` et se dégradant proprement en
  `<noscript>`.
- Accordéon FAQ accessible (clavier, ARIA, hauteur animée).
- Showroom 3D interactif complet (voir §4).
- Script unique (`window.P360`), idempotent, isolé, sans erreur console.
- JSON-LD prudent pour le référencement local (`squarespace/10-seo-jsonld.html`).

## 4. Fonctionnement du showroom

- Les données de chaque visite (titre, catégorie, localisation, description,
  image de couverture, URL d'intégration, URL externe, texte alternatif)
  sont centralisées dans un tableau JavaScript documenté
  (`window.P360_TOURS`, en tête du fichier `06-showroom-code-block.html`).
- Une seule visite est chargée à la fois ; aucune iframe n'est créée avant
  un clic explicite sur « Charger la visite 3D » (respect de la
  confidentialité et de la performance).
- Les cartes de visite sont de vrais liens (`<a href>`) : elles restent
  utilisables même si JavaScript ne s'exécute pas, en solution de secours
  elles ouvrent la visite dans un nouvel onglet.
- Un minuteur de secours (15 secondes) affiche un message d'erreur avec
  bouton « Ouvrir dans un nouvel onglet » si l'iframe ne se charge pas.
- Filtres par catégorie, plein écran (si supporté par le navigateur),
  navigation clavier native (liens/boutons).

## 5. Liste des fichiers produits

Voir l'arborescence complète du dossier `provence360-squarespace/`. En
résumé : 1 README d'installation, 6 fichiers preview + 2 pages légales
preview, 13 fichiers `squarespace/` (CSS, injections, 8 blocs de code de
page, JSON-LD, notes cookies), 11 fichiers `assets/` (logo, favicon,
icônes, README assets), 4 fichiers `content/` (textes, SEO, placeholders,
briefs images), 4 fichiers `qa/` (3 checklists + ce rapport).

## 6. Instructions essentielles d'installation

Voir `README-SQUARESPACE.md` pour le détail complet. En résumé : CSS dans
l'éditeur CSS personnalisé, JS dans l'injection de pied de page, un bloc
Code par page avec le fichier correspondant, JSON-LD dans l'injection
d'en-tête (une seule fois), bloc Formulaire natif à ajouter sur la page
Contact.

## 7. Éléments qui restent à fournir par le propriétaire du site

- Logo officiel (voir `assets/README-ASSETS.md`).
- Toutes les photographies (hero, showroom, 6 visites, équipe/fondateur —
  voir `content/briefs-images.md` pour un brief détaillé de chacune).
- Coordonnées réelles (téléphone, e-mail) — actuellement `[REMPLACER_PAR_TELEPHONE]` / `[REMPLACER_PAR_EMAIL]` partout.
- Informations légales complètes (raison sociale, SIRET, hébergeur, etc.).
- Textes des zones modifiables de la page À propos (histoire, fondateur,
  vision) — aucune biographie n'a été inventée.
- URLs d'intégration réelles des visites virtuelles (Matterport, Kuula ou
  équivalent) et noms/localisations réels des lieux.
- Configuration du bloc Formulaire Squarespace natif (destination des
  réponses).
- Liste complète et exhaustive : `content/placeholders-a-remplacer.md`.

## 8. Hypothèses effectuées

- Aucun logo ni charte graphique n'étant fourni, un symbole et une
  identité typographique temporaires ont été créés (cercle évoquant
  horizon/360°/relief), clairement identifiés comme provisoires.
- Le modèle Squarespace 7.1 exact n'étant pas connu, le site a été conçu
  pour être indépendant du template (en-tête et pied de page personnalisés
  intégrés à chaque bloc de code, avec option de repli vers la navigation
  native Squarespace documentée en README §7).
- Les URLs de page suggérées (`/services`, `/showroom-3d`, etc.) sont des
  recommandations ; elles doivent être ajustées si le propriétaire choisit
  d'autres slugs.
- Aucun chiffre commercial, avis client, note, ancienneté ou certification
  n'a été inventé, conformément à la consigne.

## 9. Limites éventuelles de Squarespace

- L'injection de code personnalisé (CSS/JS) et les blocs Code nécessitent
  un forfait Squarespace payant.
- L'exactitude du rendu dépend du template choisi (non connu au moment de
  la conception) ; l'option de masquage de l'en-tête/pied de page natifs
  (`#header, #footer { display: none }`) suppose des identifiants stables
  de la plateforme 7.1, à vérifier après publication.
- L'injection de code par page (recommandée en option pour le JSON-LD)
  peut nécessiter un forfait supérieur selon les offres Squarespace en
  vigueur au moment de l'installation.

## 10. Tests réalisés

Tests automatisés via Chromium headless (Playwright) dans cet
environnement de développement :

- **Débordement horizontal** : les 8 pages de la prévisualisation locale,
  aux 8 largeurs demandées (320 à 1440 px), avec défilement complet de
  chaque page avant mesure. Résultat final : **0 débordement**.
- **Erreurs JavaScript** : aucune erreur non interceptée (`pageerror`) sur
  aucune des 8 pages, à aucune largeur.
- **Interactions** : ouverture/fermeture du menu mobile, accordéon FAQ
  (ouverture, hauteur animée), filtres et sélection de visite dans le
  showroom, bouton « Charger la visite 3D » — toutes vérifiées par
  simulation de clics et confirmées fonctionnelles.
- **Revue de code manuelle** : sémantique HTML, usage ARIA, présence des
  textes alternatifs, absence de code mort, cohérence entre les fichiers
  `preview/` et `squarespace/`.

Non testés dans cet environnement (pas d'accès à de vrais appareils ni à
un compte Squarespace) : rendu sur iPhone/Android réels, orientation
paysage, lecteur d'écran, compte Squarespace réel. Voir le détail complet
dans `qa/checklist-responsive.md`, `qa/checklist-accessibilite.md` et
`qa/checklist-squarespace.md`.

## 11. Bugs réels trouvés et corrigés pendant les tests

Cette section documente les problèmes concrets détectés par les tests
automatisés (et non de simples suppositions) :

1. **Menu mobile inutilisable** — le panneau plein écran du menu mobile
   était positionné avec un décalage (`top`) calculé sur la hauteur de
   l'en-tête, mais un en-tête utilisant `backdrop-filter` devient, selon
   la spécification CSS, le « containing block » de ses descendants en
   `position:fixed` : le panneau se retrouvait donc piégé dans la petite
   boîte de l'en-tête au lieu de couvrir l'écran. **Corrigé** en déplaçant
   le flou d'arrière-plan sur un pseudo-élément (`::before`) plutôt que
   sur l'en-tête lui-même.
2. **Bouton de fermeture du menu inaccessible** — une fois le premier bug
   corrigé, le bouton burger (non positionné, `position:static`) restait
   peint sous le panneau du menu (fixe, positionné) quel que soit son
   ordre dans le DOM — règle de peinture CSS classique. **Corrigé** en
   donnant au bouton `position:relative` et un `z-index` supérieur.
3. **Débordement horizontal avec du texte long non sécable** — un mot
   long sans espace (ex. un placeholder `[ENTRE_CROCHETS]`) à l'intérieur
   d'un conteneur `display:flex` ou `display:grid` pouvait forcer un
   débordement horizontal, à cause du comportement par défaut
   `min-width:auto` des enfants flex/grid (et, pour du texte seul dans un
   conteneur `inline-flex`, un enfant flex anonyme qui ignore
   `max-width`). **Corrigé** par une règle `min-width:0` universelle sur
   tous les éléments, `overflow-wrap:break-word` hérité, remplacement de
   certains conteneurs `display:grid` par un simple empilement en flux
   normal (`.p360-stack`), et passage de `.p360-badge-note` de
   `inline-flex` à `block`. Ce bug touchait notamment la page À propos et
   les deux pages légales, à cause des nombreux placeholders entre
   crochets qu'elles contiennent.
4. Environnement de test : un premier essai des scripts de test automatisés
   échouait à cause d'une configuration de proxy réseau héritée par
   Chromium qui ne court-circuitait pas correctement les requêtes locales
   (`localhost`) — sans lien avec le site lui-même, réglé côté script de
   test uniquement (`--proxy-server=direct://`).

## 12. Améliorations effectuées après les différentes passes

- **Passe 1 (architecture/contenus)** : structure des 8 pages, textes
  français complets, données du showroom.
- **Passe 2 (qualité graphique)** : système de variables CSS, typographie,
  palette, composants (boutons, cartes, étapes, accordéon).
- **Passe 3 (responsive/accessibilité/performances)** : tests automatisés
  aux 8 largeurs, correction des 3 bugs listés ci-dessus, vérification
  ARIA/sémantique, showroom en chargement différé.
- **Passe 4 (finitions)** : transitions d'apparition au défilement,
  soulignements animés, en-tête compact, dégradation `<noscript>`.
- **Passe 5 (compatibilité Squarespace)** : classes préfixées `p360-`,
  script isolé/idempotent, séparation stricte CSS / en-tête / pied de page
  / blocs de page, option de navigation native documentée.

## 13. Liste précise des placeholders à remplacer

Voir le document dédié et exhaustif : `content/placeholders-a-remplacer.md`.

## 14. Prochaines actions recommandées

1. Fournir le logo officiel et les photographies (briefs prêts dans
   `content/briefs-images.md`).
2. Compléter toutes les informations légales et coordonnées réelles.
3. Créer le site dans Squarespace 7.1 et suivre `README-SQUARESPACE.md`
   pas à pas.
4. Remplacer les visites de démonstration du showroom par de vraies
   visites (Matterport, Kuula ou équivalent).
5. Brancher un bloc Formulaire Squarespace natif sur la page Contact.
6. Une fois le site publié, exécuter la checklist de
   `qa/checklist-squarespace.md` (points non vérifiables sans compte
   Squarespace réel) et tester sur de vrais appareils mobiles
   (`qa/checklist-responsive.md`).
7. Envisager un audit d'accessibilité avec un outil dédié (axe, WAVE,
   Lighthouse) et un test avec un lecteur d'écran réel avant mise en ligne
   définitive.
