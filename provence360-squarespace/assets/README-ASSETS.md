# Provence 360 — Assets (logo, icônes, images)

## 1. Statut actuel : identité temporaire

Aucun logo ni charte graphique officielle n'était présent dans le dossier du
projet. Les éléments ci-dessous sont donc des **placeholders temporaires**,
volontairement simples, cohérents avec la direction artistique du site, mais
**ils ne doivent pas être présentés comme l'identité définitive de Provence
360**.

Symbole retenu provisoirement : un cercle discret évoquant à la fois une vue
à 360°, un horizon et un relief provençal — sans référence folklorique
(pas de lavande, pas de cigale, pas de couleurs vives).

## 2. Fichiers fournis

| Fichier | Usage |
|---|---|
| `icons/p360-symbol.svg` | Symbole seul, couleur héritée (`currentColor`) — à utiliser en ligne dans la navigation et le pied de page (déjà intégré dans `squarespace/03-footer-code-injection.html`). |
| `icons/favicon.svg` | Symbole autonome sur fond plein, prêt pour l'onglet du navigateur. |
| `icons/p360-logo-clair.svg` | Symbole + texte « Provence 360 », couleurs foncées — pour fonds clairs (documents, signature email, réseaux sociaux). |
| `icons/p360-logo-sombre.svg` | Symbole + texte « Provence 360 », couleurs claires — pour fonds sombres. |
| `icons/icon-24h.svg`, `icon-immersion.svg`, `icon-clients-informes.svg`, `icon-mise-en-valeur.svg`, `icon-partage.svg`, `icon-integration.svg` | Pictogrammes du bandeau de bénéfices (page d'accueil), style trait fin cohérent avec le symbole. |

Tous les SVG sont vectoriels (redimensionnables sans perte) et utilisent
`currentColor` quand c'est pertinent, pour s'adapter automatiquement aux
couleurs du thème.

## 3. Comment remplacer le logo temporaire par le logo officiel

Quand un logo définitif est disponible :

1. Faire réaliser (ou fournir) au minimum :
   - une version pour fond clair (fichier SVG de préférence, sinon PNG haute
     résolution avec fond transparent) ;
   - une version pour fond sombre ;
   - une version « symbole seul » carrée, pour le favicon.
2. Dans Squarespace : **Design > Logo & Titre du site** — importer la version
   principale du logo (Squarespace gère l'affichage responsive du logo natif
   si vous utilisez le header natif).
3. Si le logo est intégré dans la navigation personnalisée (voir
   `squarespace/03-footer-code-injection.html`, variable `LOGO_MARKUP`) :
   remplacer le bloc `<svg>` du symbole par une balise `<img>` pointant vers
   le nouveau fichier hébergé dans Squarespace (bibliothèque d'images), en
   conservant un `alt="Provence 360"` explicite.
4. Remplacer le favicon dans **Réglages > Général > Favicon** avec la
   version carrée du symbole (Squarespace génère automatiquement les
   différentes tailles nécessaires).
5. Mettre à jour `icons/p360-logo-clair.svg` et `icons/p360-logo-sombre.svg`
   si ces fichiers doivent rester comme référence dans ce dossier de projet.
6. Vérifier le rendu du logo sur mobile (largeur réduite) et dans l'en-tête
   compact après défilement.

Ne jamais laisser le symbole provisoire dans une communication officielle
(cartes de visite, réseaux sociaux, signature email) : il est réservé à ce
prototype de site.

## 4. Images manquantes

Le dossier `images/` est vide : aucune photographie du projet n'était
disponible au moment de la conception. Le site utilise à la place des zones
de couverture stylisées (dégradés de couleur de la palette) en attendant les
visuels réels.

Chaque emplacement d'image manquante dans le HTML est identifié par un
placeholder explicite (`REMPLACER_PAR_...`) et documenté avec un brief
précis dans `content/briefs-images.md` (sujet, cadrage, lumière, format,
nom de fichier recommandé, texte alternatif).

## 5. Bonnes pratiques à respecter lors de l'ajout des vraies images

- Format WebP (ou AVIF si le plan Squarespace le permet) pour le poids.
- Respecter le ratio indiqué dans chaque brief pour éviter les recadrages
  imprévus et les sauts de mise en page.
- Renseigner systématiquement un texte alternatif descriptif (pas
  « image1.jpg »).
- Éviter les visuels trop saturés ou avec un fort contraste de couleurs
  criardes : privilégier une cohérence avec la palette du site (voir
  variables CSS dans `squarespace/01-global-custom-css.css`).
