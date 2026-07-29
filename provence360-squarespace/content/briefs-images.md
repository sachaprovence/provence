# Provence 360 — Briefs des images manquantes

Aucune photographie du projet n'étant disponible, voici un brief précis
pour chaque emplacement d'image identifié par un placeholder dans le site.
Ces briefs peuvent être transmis tels quels à un photographe ou à
l'équipe de captation.

---

## 1. Visuel du hero (page d'accueil)

- **Emplacement** : `REMPLACER_PAR_VISUEL_HERO` — `squarespace/04-home-code-block.html` / `preview/index.html`
- **Sujet** : un intérieur ou extérieur d'établissement représentatif d'une visite virtuelle Provence 360 (pièce de vie lumineuse, terrasse, salle de réception ou espace commercial).
- **Cadrage** : plan large, légèrement en contre-plongée ou hauteur d'œil, donnant une impression de profondeur et de volume (cohérent avec l'idée de "visite navigable").
- **Lumière** : lumière naturelle, douce, journée claire — éviter les flashs directs ou les ambiances nocturnes artificielles.
- **Composition** : laisser de l'espace respirable dans le cadrage (pas de sujet collé aux bords) ; éviter d'encombrer le centre de l'image pour ne pas nuire à la lisibilité si un élément d'interface est superposé.
- **Format** : ratio 4:3 (cohérent avec `.p360-hero__media`), déclinable en 1:1 pour usage mobile si besoin.
- **Zone prévue pour texte** : aucun texte n'est superposé sur l'image elle-même dans la maquette actuelle — la légende `Aperçu — visuel à remplacer` est un élément d'interface, pas un texte à intégrer dans la photo.
- **Ambiance** : contemporaine, épurée, valorisante — évite tout cliché touristique (pas de lavande en premier plan, pas d'accessoires "carte postale").
- **À éviter** : personnes reconnaissables sans droit à l'image signé, désordre visuel, filtres colorés artificiels, logos tiers visibles.
- **Taille recommandée** : au moins 1600 × 1200 px, exportée en WebP.
- **Nom de fichier recommandé** : `p360-hero-visite-3d.webp`
- **Texte alternatif suggéré** : "Intérieur lumineux d'un établissement présenté en visite virtuelle 3D par Provence 360."

---

## 2. Aperçu du showroom (section "Voyez-le par vous-même", accueil)

- **Emplacement** : `REMPLACER_PAR_IMAGE_SHOWROOM` — section showroom de la page d'accueil
- **Sujet** : capture d'écran soignée d'une visite virtuelle en cours de navigation (vue à 360° avec l'interface de la plateforme visible), ou photo d'un espace similaire au hero mais différente pour éviter la répétition.
- **Cadrage** : plan large montrant un espace complet (salon, salle, hall d'accueil).
- **Lumière** : cohérente avec le reste du site (lumière naturelle, douce).
- **Composition** : privilégier une diagonale ou une ligne de fuite qui invite à "entrer" dans l'image, en écho à la navigation dans la visite.
- **Format** : ratio 16:9, cohérent avec `.p360-showroom__player`.
- **Zone prévue pour texte** : le titre et le bouton sont superposés en bas à gauche sur un dégradé sombre — s'assurer que cette zone (environ le tiers inférieur) reste suffisamment sombre ou peu détaillée pour la lisibilité du texte blanc.
- **Ambiance** : immersive, premium.
- **À éviter** : filigranes de plateformes tierces visibles, interfaces datées.
- **Taille recommandée** : au moins 1920 × 1080 px, WebP.
- **Nom de fichier recommandé** : `p360-apercu-showroom.webp`
- **Texte alternatif suggéré** : "Aperçu d'une visite virtuelle 3D en cours d'exploration."

---

## 3 à 8. Images de couverture des visites du showroom (6 emplacements)

- **Emplacement** : `REMPLACER_PAR_IMAGE_VISITE_1` à `REMPLACER_PAR_IMAGE_VISITE_6` — `squarespace/06-showroom-code-block.html`
- **Sujet** : photo représentative de chaque lieu réellement capté (façade, pièce principale ou vue d'ensemble selon le type d'établissement).
- **Cadrage** : plan large et net, sujet centré, pas de recadrage serré qui masquerait le contexte du lieu.
- **Lumière** : lumière naturelle de préférence, cohérente entre toutes les vignettes pour une grille harmonieuse.
- **Composition** : penser à la grille — les 6 vignettes seront vues côte à côte, éviter des styles trop disparates (même traitement colorimétrique recommandé).
- **Format** : ratio 4:3, cohérent avec `.p360-tour-card__media`.
- **Zone prévue pour texte** : aucune (le titre, la catégorie et la localisation s'affichent sous l'image, pas dessus).
- **Ambiance** : correspond à la catégorie du lieu (chaleureuse pour l'hébergement, conviviale pour la restauration, professionnelle pour les commerces, etc.).
- **À éviter** : personnes non autorisées à l'image, éléments de marque tiers, images trop sombres qui nuiraient à la lisibilité en vignette.
- **Taille recommandée** : au moins 1200 × 900 px, WebP.
- **Noms de fichiers recommandés** : `p360-visite-01-immobilier.webp`, `p360-visite-02-hebergement.webp`, `p360-visite-03-restauration.webp`, `p360-visite-04-tourisme.webp`, `p360-visite-05-evenementiel.webp`, `p360-visite-06-commerces.webp` (adapter au lieu réel une fois connu).
- **Texte alternatif** : à personnaliser par lieu, ex. "Façade et jardin d'une villa provençale proposée en visite virtuelle 3D" — voir le champ `alt` du tableau `P360_TOURS` dans le fichier showroom.

---

## 9. Photographie de l'équipe ou du fondateur (page À propos)

- **Emplacement** : `REMPLACER_PAR_PHOTO_EQUIPE_OU_FONDATEUR` — `squarespace/08-a-propos-code-block.html`
- **Sujet** : portrait réel du fondateur et/ou de l'équipe de Provence 360, si possible en situation (sur le terrain, avec le matériel de captation, ou dans un cadre professionnel sobre).
- **Cadrage** : portrait ou plan poitrine, format 3:2.
- **Lumière** : naturelle, flatteuse, non surexposée.
- **Composition** : sujet légèrement décentré (règle des tiers), arrière-plan sobre et non distrayant.
- **Format** : ratio 3:2, cohérent avec l'emplacement prévu dans la page.
- **Zone prévue pour texte** : aucune superposition de texte prévue.
- **Ambiance** : humaine, accessible, professionnelle — à l'opposé d'une photo de stock générique.
- **À éviter** : photos de banque d'images génériques, arrière-plans encombrés, tenue non professionnelle.
- **Taille recommandée** : au moins 1200 × 800 px, WebP.
- **Nom de fichier recommandé** : `p360-equipe-fondateur.webp`
- **Texte alternatif suggéré** : à personnaliser avec le nom réel, ex. "[Prénom Nom], fondateur de Provence 360."

---

## Rappel général

- Format cible : WebP (ou AVIF si le plan Squarespace le permet) pour toutes les images.
- Toujours renseigner un texte alternatif descriptif et spécifique (jamais "image.jpg" ni un texte vide sur une image porteuse de sens).
- Respecter les ratios indiqués pour éviter tout saut de mise en page (`CLS`) au chargement.
- Rester cohérent avec la palette du site (voir `squarespace/01-global-custom-css.css`) : éviter les visuels aux couleurs trop saturées ou en contradiction avec l'identité "Provence contemporaine et architecturale" recherchée.
