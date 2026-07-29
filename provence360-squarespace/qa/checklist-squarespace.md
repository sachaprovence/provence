# Provence 360 — Checklist compatibilité Squarespace 7.1

## Conformité aux contraintes techniques imposées

- [x] Aucun framework SPA (pas de React/Vue/Next/Nuxt/Angular/Svelte) —
      HTML/CSS/JS vanilla uniquement.
- [x] Aucun backend requis (pas de Node.js, PHP, base de données).
- [x] Aucune dépendance npm nécessaire en production (le showroom local
      utilise Playwright uniquement pour les **tests**, jamais livré au
      site).
- [x] Toutes les classes CSS/JS préfixées `p360-` pour éviter les
      conflits avec le reste du site Squarespace.
- [x] JavaScript isolé dans un unique objet global `window.P360`.
- [x] JavaScript idempotent : chaque fonction d'initialisation vérifie un
      attribut `data-p360-bound` avant d'attacher des écouteurs, pour
      éviter les doublons si le script est réexécuté.
- [x] JavaScript résistant aux éléments absents : chaque sélection DOM est
      suivie d'une vérification (`if (!element) return;`) avant utilisation.
- [x] Pas de sélecteur Squarespace fragile basé sur un identifiant généré
      aléatoirement — la seule dépendance à la structure native de
      Squarespace concerne les identifiants stables et documentés `#header`
      et `#footer` (utilisés uniquement pour les masquer, voir
      `squarespace/01-global-custom-css.css` section 15bis), avec une
      solution de repli documentée si vous préférez ne pas les utiliser.
- [x] Iframes créées uniquement à la demande (clic utilisateur), avec
      `loading="lazy"`, une seule visite active à la fois.
- [x] Ratio responsive stable pour le lecteur du showroom (`aspect-ratio`
      CSS) afin d'éviter les sauts de mise en page.
- [x] Solution de secours (ouverture dans un nouvel onglet) systématique
      pour chaque visite du showroom.

## Tests réalisés dans cette session

- [x] Prévisualisation locale servie par un serveur HTTP statique simple
      (`python3 -m http.server`), sans étape de build — conforme à
      l'exigence "peut être ouverte simplement".
- [x] Vérification que `squarespace/01-global-custom-css.css` est
      exactement le même fichier référencé par la prévisualisation
      (aucune divergence de style entre `preview/` et `squarespace/`).
- [x] Vérification qu'aucune erreur JavaScript n'apparaît dans la console
      sur les 8 pages testées (au chargement et après interactions).
- [x] Revue manuelle de chaque fichier `squarespace/0X-*.html` pour
      confirmer l'absence de balises `<html>`, `<head>` ou `<body>` (ces
      fichiers sont conçus pour être collés dans un bloc "Code", pas comme
      documents HTML complets).

## Non vérifié dans cet environnement (nécessite un vrai compte Squarespace)

- [ ] Collage réel du CSS dans l'éditeur Squarespace ("CSS personnalisé")
      et vérification qu'aucune règle du thème par défaut n'entre en
      conflit avec les styles `p360-`.
- [ ] Collage réel des blocs de code sur des pages Squarespace publiées et
      vérification du rendu final (l'éditeur Squarespace peut, dans de
      rares cas, échapper ou modifier légèrement certains caractères HTML
      collés — à vérifier après collage).
- [ ] Fonctionnement réel de l'injection de code d'en-tête et de pied de
      page une fois le site publié (nécessite un forfait Squarespace
      payant, non disponible dans cet environnement de développement).
- [ ] Comportement de la navigation Squarespace native si l'Option B de
      navigation est choisie (voir `README-SQUARESPACE.md` section 7).
- [ ] Comportement du bloc Formulaire natif une fois branché à la place de
      l'aperçu non fonctionnel de la page Contact.
- [ ] Compatibilité exacte avec le template Squarespace finalement choisi
      par le propriétaire du site (non connu au moment de la conception).
