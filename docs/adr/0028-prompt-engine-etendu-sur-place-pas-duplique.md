# ADR 0028 — Le Prompt Engine existant (v0.5) est étendu sur place (locale/héritage/schéma typé), jamais dupliqué

- **Date** : 2026-07-30
- **Statut** : accepté

## Contexte

Le brief v0.7 liste un "Prompt Engine" parmi les quatre moteurs à créer,
avec des exigences (versionné, typé, héritable, réutilisable,
configurable, multilingue, testable, registre complet) qui ressemblent
fortement à un second système de gestion de prompts — alors qu'un moteur
de prompts versionné (`PromptTemplate`/`prompt-engine.ts`) existe déjà
depuis v0.5 et est activement utilisé par l'Agent Commercial.

## Décision

- Aucun second système n'est créé. `PromptTemplate` est étendu avec trois
  champs : `locale` (défaut `"fr"`, contrainte unique déplacée vers
  `(key, version, locale)`), `parentKey` (héritage), `variableSchema`
  (typage des variables : type, requis, description).
- `prompt-engine.ts` gagne les fonctions correspondantes :
  `resolvePromptChain` (remonte la chaîne `parentKey`, bornée et protégée
  contre les cycles), `mergedVariableSchema`/`mergedVariableNames`
  (l'enfant surcharge le parent), `validatePromptVariables` (types et
  champs requis), `getActivePrompt`/`renderPrompt` avec repli sur la
  locale `"fr"` si la locale demandée n'a pas de version active.
- `renderTemplateString` est extrait comme fonction pure (substitution
  `{{variable}}`), testable sans base de données — utile pour les futurs
  tests de rendu qui n'ont pas besoin d'exercer Prisma.

## Conséquences

- Un seul registre de prompts dans tout le projet : pas de question à se
  poser ("est-ce que ce texte est dans l'ancien ou le nouveau système ?").
- La migration de schéma (`locale` ajouté à la contrainte unique) est
  additive pour les données existantes : chaque ligne actuelle reçoit
  `locale = "fr"` par défaut, donc l'ancienne unicité `(key, version)`
  reste vraie comme sous-cas de la nouvelle `(key, version, locale)`.
- Le code appelant existant (`generateNarrative`, v0.5) continue de
  fonctionner sans modification : la locale par défaut `"fr"` couvre son
  usage actuel.

## Alternatives écartées

- **Un second modèle `PromptTemplateV2`/moteur parallèle** : fermement
  écartée — duplication pure, et exactement le genre d'ambiguïté que le
  brief cherche à éliminer ("Aucun prompt ne devra être codé directement
  dans les services" implique un seul registre faisant autorité).
- **Renommer `PromptTemplate` en conservant l'ancien nom de table
  seulement en façade** : écartée — inutile, aucune contrainte de
  compatibilité externe ne l'impose (le modèle est interne au projet).
