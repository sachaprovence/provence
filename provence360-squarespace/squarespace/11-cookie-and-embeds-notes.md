# Provence 360 — Notes sur les cookies et les contenus tiers (showroom)

## 1. Pourquoi ce document existe

La page Showroom 3D intègre des visites virtuelles hébergées par des
plateformes externes (Matterport, Kuula, ou toute autre plateforme
fournissant une URL d'intégration `iframe`). Ces plateformes peuvent
déposer leurs propres cookies ou trackers lorsque leur contenu se charge.
Ce document explique comment le site limite cet impact et ce qu'il reste
à vérifier avec le propriétaire du site.

## 2. Ce que le site fait déjà pour limiter l'impact

- **Aucune iframe n'est chargée automatiquement.** Au chargement de la page
  Showroom 3D, seule une image de couverture stylisée est affichée, avec un
  bouton explicite « Charger la visite 3D ». Le contenu tiers (et ses
  cookies éventuels) ne se charge donc qu'après une action volontaire du
  visiteur.
- **Une seule visite active à la fois.** Changer de visite retire l'iframe
  précédente du DOM plutôt que d'en empiler plusieurs.
- **`loading="lazy"` et `referrerpolicy="no-referrer-when-downgrade"`**
  sont appliqués à chaque iframe créée, pour limiter les informations
  transmises par défaut.
- **Solution de secours toujours disponible** : chaque visite reste
  accessible via un lien classique (`<a href="…" target="_blank">`),
  qui fonctionne même si les cookies tiers sont bloqués par le navigateur
  ou une extension de blocage.

## 3. Ce que cela ne dispense pas de faire

Cette approche « chargement à la demande » réduit le nombre de visiteurs
exposés à des cookies tiers non sollicités, mais **ne remplace pas une
bannière de consentement aux cookies** si votre site utilise par ailleurs
des outils de mesure d'audience, publicité ou tout autre traceur nécessitant
un consentement au sens de la réglementation applicable (RGPD / ePrivacy,
recommandations CNIL en France).

Recommandations :

1. Si vous ajoutez Google Analytics, Meta Pixel, ou tout autre outil de
   suivi via Squarespace, configurez un bandeau de consentement cookies
   (Squarespace propose un bloc natif de bannière de consentement dans
   certains plans — voir Réglages > RGPD / Confidentialité).
2. Vérifiez les conditions d'utilisation de la plateforme de visite
   virtuelle choisie (Matterport, Kuula, etc.) : certaines proposent des
   modes d'intégration « respectueux de la vie privée » ou des réglages de
   cookies à activer côté plateforme.
3. Mentionnez la présence de ces contenus tiers dans la politique de
   confidentialité du site (déjà anticipé dans
   `squarespace/13-confidentialite-code-block.html`, section « Cookies et
   contenus tiers »).

## 4. Compatibilité des plateformes d'intégration

Le showroom accepte toute URL d'intégration fournie par une plateforme
autorisant l'affichage en `iframe` (vérifiez que la plateforme choisie
n'envoie pas d'en-tête `X-Frame-Options: DENY` ou de règle CSP
`frame-ancestors` bloquant votre domaine Squarespace — c'est le cas de la
plupart des plateformes de visite virtuelle grand public comme Matterport
ou Kuula, mais à vérifier si vous changez de prestataire).

## 5. Performance

Le chargement à la demande n'est pas qu'une bonne pratique de
confidentialité : c'est aussi ce qui permet à la page Showroom 3D de rester
rapide même avec plusieurs dizaines de visites listées, puisqu'aucune
iframe lourde n'est chargée avant un clic explicite.
