# FAQ

## Dois-je payer ou configurer une clé API pour essayer Autorun ?

Non. Le projet fonctionne **entièrement en mode démonstration** dès
l'installation : email, IA, Google Calendar, Slack, Discord et Stripe ont
tous un comportement simulé fonctionnel sans aucune clé ni compte externe.
Voir [INSTALLATION.md](./INSTALLATION.md) et
[Brancher de vrais fournisseurs](../../README.md#brancher-de-vrais-fournisseurs-après-le-mode-démo)
pour brancher de vrais services quand vous le souhaitez.

## Quelle est la différence entre un Workflow et une Automatisation ?

Les deux se créent et s'activent depuis l'interface, sans JSON. Un
**Workflow** (`/workflows`) s'exécute **immédiatement et de façon
synchrone** dès qu'il est déclenché manuellement ou par un évènement — le
résultat est visible tout de suite. Une **Automatisation** (`/automations`)
passe par une file d'attente durable (utile pour la planification, les
tentatives multiples et les gros volumes) — son exécution peut prendre
quelques secondes de plus mais survit à un redémarrage du serveur. Les deux
partagent le même moteur de déclencheurs/conditions et le même catalogue de
modèles prêts à l'emploi.

## Quelle est la différence entre un agent du catalogue et un "agent
personnalisé" ?

Le **catalogue d'agents** (`/settings/agents`, réservé aux administrateurs)
liste les agents du Framework livrés avec le produit (Director, Commercial,
et les agents métier spécialisés) — leur logique est fixée dans le code.
Un **agent IA personnalisé** (`/agents`, v1.6) se crée entièrement depuis
l'interface : vous choisissez son nom, son fournisseur IA, ses outils
autorisés et si sa mémoire est activée, puis vous discutez avec lui
immédiatement — aucun code à écrire.

## Le bouton "Découvrir Autorun" a disparu de mon tableau de bord, pourquoi ?

Il n'est affiché que tant qu'aucun agent IA personnalisé n'existe encore
dans votre workspace — une fois que vous (ou "Découvrir Autorun"
lui-même) en avez créé un, le bouton se retire pour laisser place aux
données réelles. Rien n'est perdu : les éléments provisionnés (workflow,
automatisation, agent, connecteurs simulés) restent visibles et utilisables
normalement dans leurs écrans respectifs.

## J'ai lancé "Découvrir Autorun" deux fois, est-ce que ça a tout dupliqué ?

Non. Chaque élément provisionné (automatisation, workflow, agent,
connecteur) utilise une clé déterministe par organisation — un second
appel détecte que l'élément existe déjà et ne le recrée pas. Voir
`tests/onboarding/demo-discovery-service.test.ts` pour la vérification
automatisée de cette idempotence.

## Comment devenir administrateur de la plateforme (toutes organisations) ?

Ce n'est **jamais** réglable depuis l'application — volontairement, pour
qu'aucun client ne puisse s'auto-promouvoir. Voir
[PLATFORM_ADMINISTRATION.md](./PLATFORM_ADMINISTRATION.md).

## Puis-je utiliser un vrai modèle IA (OpenAI, Anthropic...) pour mes agents
personnalisés ?

Oui — la liste des fournisseurs disponibles est proposée directement dans
le formulaire de création d'agent (`/agents`) : démo, OpenAI, Anthropic,
Google, Mistral, OpenRouter, Azure OpenAI, Ollama. Chaque fournisseur réel
nécessite sa clé API configurée côté serveur (`.env`, jamais saisie dans
l'interface) ; sans configuration, le fournisseur "démo" reste disponible
sans aucune clé pour essayer immédiatement.

## Une exécution de workflow ou d'automatisation a échoué, comment savoir
pourquoi ?

Ouvrir le détail de l'exécution concernée (`/workflows` ou
`/automations`) : chaque nœud du graphe affiche son statut, sa durée et,
en cas d'échec, le message d'erreur exact. Voir aussi
[TROUBLESHOOTING.md](./TROUBLESHOOTING.md) pour les causes les plus
fréquentes.

## Où voir combien l'IA me coûte ?

**Paramètres → Métriques** (`/settings/metrics`, réservé aux
administrateurs) affiche le coût IA cumulé, actualisé automatiquement
toutes les 30 secondes, ainsi que le taux d'échec email et la latence API.
Un quota mensuel dur optionnel peut aussi être réglé par organisation
(Paramètres → Entreprise).

## Est-ce que je peux tout faire sans écrire de code ?

Oui — c'est l'objectif explicite de la version 1.6 : créer un compte,
inviter une équipe, connecter Gmail/Google Calendar/Slack/Discord, créer et
exécuter un workflow, créer un agent IA et discuter avec lui, consulter les
logs/coûts/statistiques, tout se fait depuis l'interface. Voir
[USER_GUIDE.md](./USER_GUIDE.md) pour le détail pas à pas de chaque
fonctionnalité.
