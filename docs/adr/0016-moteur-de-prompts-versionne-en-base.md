# ADR 0016 — Moteur de prompts : templates versionnés en base, pas des constantes de code

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

La demande exige que chaque prompt soit "versionné, modifiable, testable,
documenté, réutilisable, séparé du code". Le réflexe le plus simple aurait
été des constantes TypeScript (`const DRAFT_EMAIL_PROMPT = "..."`) —
rapide, mais ne satisfait ni "modifiable sans redéploiement", ni
"versionné" (un historique interrogeable des versions passées), ni
vraiment "séparé du code" (le texte resterait dans un fichier `.ts`).

## Décision

`PromptTemplate` (modèle Prisma, `@@unique([key, version])`) : chaque
prompt vit en base, avec un texte (`template`, substitution `{{variable}}`),
une liste de variables déclarées (`variables`), une catégorie et une
description. `src/lib/agents/prompts/prompt-engine.ts` expose :

- `createPromptVersion` : crée toujours une **nouvelle** version
  (jamais une modification en place d'une version existante — l'historique
  reste intact), désactive l'ancienne version active par défaut.
- `activatePromptVersion` : revient à une version antérieure sans en
  créer de nouvelle (rollback).
- `renderPrompt` : charge la version active d'une clé et substitue ses
  variables déclarées — refuse explicitement (erreur claire) toute
  variable déclarée mais non fournie, jamais un rendu partiel silencieux.

Générique — ce moteur n'appartient pas au Commercial en particulier,
n'importe quel agent futur (métier ou orchestrateur) peut définir ses
propres prompts versionnés sans dépendre du Commercial.

## Conséquences

- "Modifiable sans redéploiement" est réel : créer une nouvelle version
  ou revenir à une ancienne est une opération de données, pas de code.
- "Testable" est réel : `renderPrompt` est une fonction pure testable
  isolément (voir `tests/agents/commercial-prompts.test.ts`), sans
  dépendre d'un fournisseur LLM.
- "Séparé du code" est réel : le texte des prompts par défaut vit dans
  `commercial/prompt-seeds.ts` uniquement comme **valeur initiale** (créée
  une seule fois si aucune version n'existe encore pour la clé, jamais
  réécrite ensuite) — après le premier démarrage, la base est la seule
  source de vérité.
- Limite assumée : aucune interface d'administration pour éditer un
  prompt n'a été construite dans cette phase (le moteur expose les
  fonctions nécessaires, mais l'édition se fait aujourd'hui par script/
  console) — l'ask explicite portait sur le moteur, pas sur une UI
  d'édition de prompts ; à ajouter si un besoin réel apparaît.

## Alternatives écartées

- **Un fichier JSON/YAML versionné par Git** : écartée — "modifiable sans
  redéploiement" implique explicitement de ne pas nécessiter un nouveau
  déploiement de code pour changer un prompt.
- **Une seule ligne par clé, réécrite en place à chaque modification** :
  écartée — perdrait l'historique des versions précédentes, contredisant
  directement "versionné".
