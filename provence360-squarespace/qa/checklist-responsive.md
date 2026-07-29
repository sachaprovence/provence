# Provence 360 — Checklist responsive

Tests réalisés automatiquement (Chromium headless, via Playwright) sur les
8 pages de la prévisualisation locale (`preview/*.html`), aux 8 largeurs
demandées : 320, 375, 390, 430, 768, 1024, 1280, 1440 px.

## Résultats vérifiés automatiquement

| Élément | Résultat |
|---|---|
| Absence de débordement horizontal (`scrollWidth > clientWidth`) | ✅ Vérifié sur les 8 pages × 8 largeurs, avec défilement complet de chaque page avant mesure — 0 débordement sur la passe finale |
| Menu mobile : ouverture / fermeture, bouton burger toujours cliquable | ✅ Vérifié par simulation de clic (largeur 375 px) — bug corrigé : le panneau plein écran ne couvrait pas tout l'écran et le bouton de fermeture devenait inaccessible (voir `rapport-final.md`) |
| Accordéon FAQ : ouverture/fermeture, hauteur animée | ✅ Vérifié par simulation de clic sur la page Contact |
| Showroom : filtre par catégorie, sélection d'une visite, mise à jour du panneau actif, bouton "Charger la visite 3D" | ✅ Vérifié par simulation de clics sur la page Showroom 3D |
| Chargement des pages sans erreur JavaScript bloquante (`pageerror`) | ✅ Aucune erreur JavaScript non interceptée détectée sur les 8 pages testées |
| Titres, espacements, boutons : redimensionnement fluide (`clamp()`, grilles responsives) | ✅ Vérifié visuellement par captures d'écran à 320, 375, 768, 1440 px sur la page d'accueil et la page À propos |
| Textes longs et non sécables (placeholders `[ENTRE_CROCHETS]`, mots composés) | ✅ Bug réel trouvé et corrigé : dans un conteneur `display:flex`/`grid`, un mot long sans espace pouvait forcer un débordement horizontal (comportement par défaut `min-width:auto` des enfants flex/grid). Corrigé par une règle `min-width:0` universelle + `overflow-wrap:break-word` (voir `rapport-final.md`). Revérifié avec les placeholders réels les plus longs du site (ex. `REMPLACER_PAR_PRESENTATION_FONDATEUR_EQUIPE`) : aucun débordement. |

## Points non vérifiables dans cet environnement (à tester manuellement avant mise en ligne)

Cet environnement de travail ne dispose pas d'appareils physiques ni de
simulateur d'orientation d'écran ; les points suivants **n'ont pas pu être
testés réellement** et doivent être vérifiés par le propriétaire du site
avant publication, idéalement sur de vrais appareils :

- [ ] Rendu sur un véritable iPhone (Safari iOS) — le rendu Chromium ne
      remplace pas totalement Safari, notamment pour le comportement des
      `input[type=date]`, du clavier virtuel et des zones sûres (encoche).
- [ ] Rendu sur un véritable appareil Android (Chrome mobile).
- [ ] **Orientation paysage** sur mobile et tablette (non simulée dans
      cette session — à vérifier notamment sur la page Showroom 3D, dont
      le lecteur 16:9 peut devenir haut par rapport à la fenêtre en
      paysage sur petit écran).
- [ ] Zones tactiles : les boutons respectent une hauteur minimale de 44 px
      dans le CSS (`.p360-btn`, `.p360-burger`, `.p360-filter`), mais un
      test tactile réel sur écran capacitif reste recommandé.
- [ ] Comportement du clavier virtuel mobile sur le formulaire (une fois le
      bloc Formulaire Squarespace natif installé, voir
      `README-SQUARESPACE.md` section 14).

## Largeurs testées

- [x] 320 px
- [x] 375 px
- [x] 390 px
- [x] 430 px
- [x] 768 px
- [x] 1024 px
- [x] 1280 px
- [x] 1440 px
