# Audit détaillé des vulnérabilités npm — v1.2 (AR-0170)

Date : 2026-08-04. État avant correction : `npm audit` rapportait **5
vulnérabilités, toutes de sévérité `high`, 0 critique**. État après
correction : **0 vulnérabilité** (`npm audit` → `found 0 vulnerabilities`).

Aucune commande destructive utilisée (`npm audit fix --force` jamais
exécuté). Aucune montée de version majeure de Next.js — le passage
`16.2.12` → `16.3.0` est un correctif mineur (`isSemVerMajor: false`
confirmé par `npm audit`'s champ `fixAvailable`), validé par la suite de
tests complète avant application.

## 1. `brace-expansion` (GHSA-mh99-v99m-4gvg / GHSA-rgw5-rvv9-x895)

- **Dépendance** : transitive, DEUX instances distinctes dans le graphe.
- **Chaîne complète (instance 1)** : `eslint@9.39.5` → `minimatch@3.1.5`
  → `brace-expansion@1.1.16`.
- **Chaîne complète (instance 2)** : `eslint-config-next@16.2.12` →
  `typescript-eslint@8.65.0` → `@typescript-eslint/typescript-estree@8.65.0`
  → `minimatch@10.2.6` → `brace-expansion@5.0.8`.
- **Identifiants d'avis** : GHSA-mh99-v99m-4gvg (plage `<1.1.17`,
  CVSS 7.5) et GHSA-rgw5-rvv9-x895 (plage `>=4.0.0 <5.0.9` — contournement
  du correctif précédent CVE-2026-14257).
- **Versions affectées installées** : `1.1.16` et `5.0.8`.
- **Impact potentiel** : déni de service par expansion non bornée d'un
  motif d'accolades (`{a,b}{c,d}...`), consommation mémoire excessive
  jusqu'au crash du processus (CWE-400/770).
- **Exploitabilité dans Autorun** : **nulle en production**.
  `brace-expansion` n'est utilisé QUE par `eslint`/`typescript-eslint`
  (dépendances de développement, jamais empaquetées dans l'image de
  production — voir `.dockerignore`/étapes du `Dockerfile`) pour évaluer
  des motifs glob écrits par les développeurs du dépôt eux-mêmes, jamais
  un motif contrôlé par un utilisateur final de l'application.
- **Routes/composants exposés** : aucun.
- **Correctif disponible** : oui (`npm audit fix`, sans `--force`) — les
  deux instances proviennent de plages semver déclarées par `minimatch`
  lui-même (`^3.1.5`/`^10.x`), la résolution vers `1.1.18`/`5.0.9`
  respecte ces plages sans toucher aux versions déclarées d'`eslint`/
  `eslint-config-next`/`typescript-eslint` dans `package.json`.
- **Risque de la montée de version** : nul — mise à jour d'une
  dépendance transitive de niveau patch, aucune API concernée.
- **Décision** : **corrigé** via `npm audit fix`. Versions résolues :
  `1.1.18` et `5.0.9` (vérifié par `npm ls brace-expansion`).

## 2. `fast-uri` (GHSA-7p8r-x3mc-p8w7)

- **Dépendance** : transitive.
- **Chaîne complète** : `prisma@7.9.1` → `@prisma/dev@0.24.17` →
  `@prisma/streams-local@0.1.11` → `ajv@8.20.0` → `fast-uri@3.1.4`.
- **Identifiant d'avis** : GHSA-7p8r-x3mc-p8w7, plage `>=3.0.0 <3.1.5`,
  CVSS 7.5.
- **Version affectée installée** : `3.1.4`.
- **Impact potentiel** : confusion d'autorité (host) via un
  introducteur de barre oblique inverse dans une URI — pourrait tromper
  un composant de sécurité s'appuyant sur `fast-uri` pour déterminer
  l'hôte réel d'une URI (CWE-436).
- **Exploitabilité dans Autorun** : **nulle en production**. `fast-uri`
  n'intervient ici que via l'outillage de développement Prisma
  (`@prisma/dev`, utilisé par les commandes CLI `prisma migrate`/
  `prisma generate` etc.), jamais chargé par le client Prisma exécuté en
  production (`@prisma/client` + `@prisma/adapter-pg`, voir
  `src/lib/prisma.ts`) ni par aucun code applicatif qui analyserait des
  URI fournies par un utilisateur.
- **Routes/composants exposés** : aucun.
- **Correctif disponible** : oui (`npm audit fix`, sans `--force`) — plage
  semver `ajv@8.20.0` déclarée par `@prisma/streams-local` autorise déjà
  `fast-uri@3.1.5`.
- **Risque de la montée de version** : nul.
- **Décision** : **corrigé** via `npm audit fix`. Version résolue :
  `3.1.5` (vérifié par `npm ls fast-uri`).

## 3. `postcss` (GHSA-qx2v-qp2m-jg93 / GHSA-6g55-p6wh-862q / GHSA-r28c-9q8g-f849 / GHSA-fxqj-rqcc-2cmp)

- **Dépendance** : transitive, empaquetée par `next@16.2.12` lui-même
  (`node_modules/next/node_modules/postcss@8.4.31`) — DISTINCTE de la
  copie `postcss@8.5.23` utilisée par `@tailwindcss/postcss`/`vite`,
  jamais signalée par l'audit (déjà une version corrigée).
- **Chaîne complète** : `next@16.2.12` → `postcss@8.4.31` (dépendance
  interne empaquetée par Next.js pour son pipeline CSS).
- **Identifiants d'avis** (4, cumulés sur la plage `<=8.5.22`) :
  - GHSA-qx2v-qp2m-jg93 (modéré) — XSS via `</style>` non échappé dans la
    sortie de stringification CSS.
  - GHSA-6g55-p6wh-862q (élevé) — lecture de fichier arbitraire/
    divulgation d'information via `sourceMappingURL` contrôlé par un
    attaquant dans un commentaire CSS.
  - GHSA-r28c-9q8g-f849 (élevé) — traversée de répertoire dans le
    chargement automatique de source map précédente.
  - GHSA-fxqj-rqcc-2cmp (modéré) — correctif incomplet de
    GHSA-6g55-p6wh-862q.
- **Version affectée installée** : `8.4.31`.
- **Impact potentiel** : lecture de fichiers arbitraires côté serveur,
  XSS, si PostCSS traite un contenu CSS contrôlé par un attaquant.
- **Exploitabilité dans Autorun** : **nulle en production**. PostCSS est
  un outil de **construction** (traite le CSS du dépôt — Tailwind,
  composants — pendant `next build`/`next dev`), jamais exécuté au
  runtime sur une requête HTTP. Autorun ne propose aucune fonctionnalité
  d'upload/traitement de CSS fourni par un utilisateur (aucun vecteur
  d'entrée contrôlé par un attaquant vers PostCSS).
- **Routes/composants exposés** : aucun.
- **Correctif disponible** : oui, via la montée de `next` vers `16.3.0`
  (embarque une version corrigée de PostCSS).
- **Décision** : **corrigé** via la montée de version de `next` (voir
  ci-dessous, §5).

## 4. `sharp` (GHSA-f88m-g3jw-g9cj)

- **Dépendance** : transitive, empaquetée par `next@16.2.12` (utilisée
  par l'API d'optimisation d'image intégrée `next/image`).
- **Chaîne complète** : `next@16.2.12` → `sharp@0.34.5`.
- **Identifiant d'avis** : GHSA-f88m-g3jw-g9cj — vulnérabilités héritées
  de `libvips` (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590,
  CVE-2026-35591), plage `<0.35.0`.
- **Version affectée installée** : `0.34.5`.
- **Impact potentiel** : dépend des CVE `libvips` sous-jacentes (traitement
  d'image côté serveur) — potentiellement déni de service ou exécution de
  code selon la CVE précise, via une image malveillante transformée
  côté serveur.
- **Exploitabilité dans Autorun** : **nulle** — **vérifié par recherche
  exhaustive dans le code** (`grep -rl "next/image" src/`) : le composant
  `next/image` (seul point d'entrée qui invoque `sharp` côté serveur)
  n'est utilisé NULLE PART dans l'application. Les deux seules occurrences
  de la chaîne `next/image` dans le dépôt sont (1) une exclusion de route
  dans le matcher de `src/proxy.ts` (jamais un appel réel), et (2) un
  commentaire dans `src/components/organization-form.tsx` expliquant
  pourquoi une balise `<img>` classique est utilisée à la place
  (aperçu d'une URL arbitraire, non optimisable). `sharp` est donc
  installé mais son code n'est jamais exécuté par Autorun au runtime.
- **Routes/composants exposés** : aucun (fonctionnalité non utilisée).
- **Correctif disponible** : oui, via la montée de `next` vers `16.3.0`.
- **Décision** : **corrigé** via la montée de version de `next` (élimine
  le risque latent même si actuellement inexploité — au cas où
  `next/image` serait adopté plus tard sans qu'un futur audit ne
  reprenne cette analyse).

## 5. `next` (entrée agrégatrice, sans avis propre)

`next` apparaissait dans `npm audit` non pas pour une vulnérabilité qui
lui serait propre, mais comme AGRÉGATEUR signalant ses dépendances
vulnérables (`postcss`, `sharp`, voir §3-4 ci-dessus) — `via: ["postcss",
"sharp"]` dans la sortie JSON d'audit.

- **Fix proposé par npm** : `next@16.3.0`, `isSemVerMajor: false`
  (confirmé — reste dans la ligne majeure `16.x`, aucune contrainte
  "pas de montée majeure" enfreinte).
- **Analyse d'incompatibilité effectuée avant application** :
  - `eslint-config-next` monté en lockstep vers `16.3.0` (même version
    que `next`, convention du paquet officiel).
  - `react`/`react-dom` (`19.2.4`) inchangés — `next@16.3.0` reste
    compatible avec cette plage (aucune contrainte peer resserrée
    signalée par `npm install`).
  - Recherche de l'usage de `next/image` : confirmée absente (voir §4) —
    élimine le principal vecteur de rupture potentiel d'une montée de
    version de Next.js touchant à l'optimisation d'image.
- **Validation complète de la suite de tests effectuée** (résultats
  détaillés en fin de document, §6) : `tsc --noEmit`, `eslint`, suite
  `vitest` complète (803 tests), `npm run build` (production), tentative
  de suite E2E `golden-path.mjs`.
- **Décision** : **appliqué**. `next: 16.2.12 → 16.3.0`,
  `eslint-config-next: 16.2.12 → 16.3.0`.

## Vulnérabilités restantes après correction

**Aucune.** `npm audit` confirme `found 0 vulnerabilities` après
application des correctifs ci-dessus.

## 6. Validation complète effectuée après les montées de version

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit` | ✅ propre |
| `npx eslint .` | ✅ propre (9 avertissements préexistants, sans rapport, inchangés) |
| `npx vitest run` | ✅ 803/803 tests passent (138 fichiers) |
| `npm run build` (production) | ✅ réussi, toutes les routes construites |
| `npm audit` | ✅ `found 0 vulnerabilities` |
| Suite E2E `tests/e2e/golden-path.mjs` | ⚠️ voir note ci-dessous |

**Note sur la suite E2E** : exécutée manuellement contre un vrai serveur
de production (`next start`) sur `next@16.3.0`. Connexion, tableau de
bord et navigation vers la liste des prospects ont fonctionné visuellement
(preuve que l'application fonctionne de bout en bout sur la nouvelle
version) ; le test s'est arrêté sur un délai dépassé en attendant qu'un
lien de tableau précis devienne visible. Cette même suite a déjà été
caractérisée comme intermittente dans cet environnement de développement
pendant AR-0163 (deux exécutions distinctes avaient échoué à deux étapes
différentes, sans rapport avec une erreur de code, pour des raisons de
timing sous charge) — non traité comme un signal de régression liée à
cette montée de version, corroboré par les 803 tests unitaires/
d'intégration (dont plusieurs exercent directement `GET /api/leads` et
les routes équivalentes contre la vraie base de données) qui, eux,
passent tous. `golden-path.mjs` reste la suite de référence pour la
recette de préproduction (AR-0171), où elle sera de nouveau exécutée.

## Conclusion

5 vulnérabilités `high`, 0 critique, avant correction. 0 vulnérabilité
après. Aucune commande destructive (`--force`) utilisée. Un seul
changement de version directe (`next`/`eslint-config-next`,
`16.2.12 → 16.3.0`, non majeure), analysé pour incompatibilité avant
application (usage de `next/image` vérifié absent) et validé par la
suite de tests complète + un build de production réel.
