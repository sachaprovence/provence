# Provence 360 — Checklist accessibilité (WCAG, bonnes pratiques)

## Vérifié dans le code (revue manuelle)

- [x] **HTML sémantique** : `<header>`, `<nav>`, `<main>`, `<footer>`,
      `<article>` utilisés à bon escient sur toutes les pages.
- [x] **Ordre logique des titres** : un seul `<h1>` par page, `<h2>` pour
      les sections, `<h3>` pour les sous-éléments (cartes, étapes, FAQ) —
      pas de saut de niveau (`h1` → `h3` direct).
- [x] **Boutons codés comme boutons** : toutes les actions qui ne changent
      pas de page (menu mobile, filtres, accordéon, chargement de la
      visite 3D, plein écran) utilisent `<button type="button">`.
- [x] **Liens codés comme liens** : toute navigation (changement de page ou
      d'URL) utilise `<a href="…">`, y compris les cartes du showroom
      (voir `squarespace/06-showroom-code-block.html`), pour rester
      utilisables sans JavaScript.
- [x] **Lien d'évitement ("skip link")** : `.p360-skip-link` présent en
      première position du contenu de chaque page, visible au focus
      clavier, pointant vers `#p360-main`.
- [x] **Attributs ARIA utiles uniquement** : `aria-expanded` /
      `aria-controls` sur le menu mobile, l'accordéon FAQ et les filtres du
      showroom ; `aria-current="page"` sur le lien de navigation actif ;
      `aria-label` sur les zones sans texte visible (ex. bouton burger,
      image de couverture du hero).
- [x] **Textes alternatifs** : prévus pour toutes les images (attribut
      `alt`), y compris un champ `alt` dédié dans le tableau de données du
      showroom (`P360_TOURS`) — actuellement en placeholder, à compléter
      avec les vraies images (voir `content/briefs-images.md`).
- [x] **Accordéon FAQ accessible** : bouton avec `aria-expanded`, panneau
      relié par `aria-controls`/`id`, région annoncée (`role="region"`,
      `aria-labelledby`), fonctionne au clavier (élément `<button>` nativement focusable).
- [x] **Fermeture au clavier (Échap)** : le menu mobile se ferme avec la
      touche Échap et remet le focus sur le bouton burger (voir
      `assets/js/p360-main.js`, fonction `initMobileNav`).
- [x] **États de focus visibles** : règle globale
      `:focus-visible { outline: 2px solid var(--p360-color-focus); }`
      appliquée à tous les éléments interactifs (section 2 du CSS).
- [x] **Pas d'information transmise uniquement par la couleur** : le lien
      de navigation actif combine couleur ET soulignement animé ; les
      cartes de démonstration combinent un badge textuel explicite
      (« Projet de démonstration », etc.) en plus de leur style visuel.
- [x] **Réduction des animations respectée** : règle
      `@media (prefers-reduced-motion: reduce)` neutralise toutes les
      transitions/animations et force `.p360-reveal` à rester visible.
- [x] **Contenu utilisable sans JavaScript** : voir
      `README-SQUARESPACE.md` section 18 et les blocs `<noscript>` présents
      sur chaque page.
- [x] **Contraste des couleurs (vérification visuelle manuelle)** : le
      texte courant (`--p360-color-ink #3E3A33`) sur fond clair
      (`--p360-color-bg #FAF7F1`) et le texte blanc sur fond sombre
      (`--p360-color-noir-chaud #1B1916`) offrent un contraste élevé. Le
      bouton primaire (texte blanc sur `--p360-color-terracotta #B15C31`)
      a été choisi pour rester lisible. **Un contrôle avec un outil dédié
      (ex. axe DevTools, WAVE, ou le vérificateur de contraste WebAIM) n'a
      pas pu être exécuté dans cet environnement** et reste recommandé
      avant mise en ligne, en particulier pour les libellés en petite
      taille (`--p360-fs-label`) sur fond `--p360-color-sand`.

## Vérifié par test automatisé (Chromium headless)

- [x] Navigation clavier de base : le menu mobile s'ouvre/se ferme par
      clic simulé et la touche Échap referme le menu (testé via script).
- [x] Focus renvoyé sur le bouton burger après fermeture au clavier
      (implémenté dans le script ; comportement vérifié dans le code).

## Non vérifié dans cet environnement (recommandé avant mise en ligne)

- [ ] Test avec un lecteur d'écran réel (VoiceOver, NVDA ou JAWS) — aucun
      lecteur d'écran n'a pu être exécuté dans cet environnement.
- [ ] Audit automatisé de contraste et d'accessibilité (axe, Lighthouse
      Accessibility, WAVE) sur le site publié.
- [ ] Navigation clavier complète page par page (Tab / Shift+Tab à travers
      tous les éléments interactifs) sur un vrai navigateur.
- [ ] Vérification du zoom texte navigateur jusqu'à 200 % sans perte de
      contenu ni de fonctionnalité.
