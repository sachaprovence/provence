# Configurer un modèle d'automatisation

## Les modèles prêts à l'emploi

Autorun fournit 15 modèles d'automatisation prêts à l'emploi (Automation
Engine, `/automations`), dont 4 ajoutés en v1.4 :

| Modèle | Déclencheur | Ce qu'il fait |
|---|---|---|
| Qualification d'une demande entrante | Nouvelle demande entrante | Qualifie automatiquement puis crée une tâche de suivi si pertinent |
| Résumé quotidien de l'activité | Chaque matin (7h) | Diffuse un résumé des dernières 24h (prospects, messages, RDV, automatisations) |
| Prospect devenu prioritaire | Score de prospect franchissant le seuil de priorité | Notifie l'équipe immédiatement |
| Création automatique d'une tâche de suivi | Rendez-vous confirmé | Crée une tâche de préparation, échéance à J-1 |

Les 11 autres (nouveau prospect, demande de devis, visite terminée,
facturation envoyée, paiement reçu, client inactif, demande d'avis
Google, relance automatique, publication réseaux sociaux, livraison
effectuée...) existent depuis les versions précédentes — voir
`/automations` pour la liste complète et leur description.

## Cloner et configurer un modèle

Un modèle affiché dans le catalogue (`isTemplate=true`) **ne peut jamais
être activé directement** — il doit d'abord être cloné dans un workspace :

1. Depuis `/automations`, choisir un modèle et le cloner (ou passer par
   l'étape "Modèle" de l'onboarding guidé, qui fait exactement la même
   opération pour un modèle de démonstration).
2. Le clone est créé en brouillon (`DRAFT`), avec sa propre clé et son
   propre historique de versions — modifier le clone n'affecte jamais le
   modèle d'origine, et modifier le modèle d'origine (mise à jour future
   du catalogue) n'affecte jamais un clone déjà créé.
3. Adapter le graphe si besoin (déclencheur, conditions, actions) depuis
   l'éditeur visuel.
4. Activer le clone : il ne s'exécute qu'à partir de ce moment, sur les
   évènements réels de l'organisation.

Un même modèle peut être cloné plusieurs fois dans un même workspace (sous
des clés différentes), pour par exemple avoir deux variantes actives en
parallèle (ex. un rappel à J-1 et un autre à J-3).

## Écrire une nouvelle automatisation depuis zéro

Au-delà des modèles fournis, `/automations/new` permet de composer un
graphe entièrement personnalisé : déclencheur (évènement métier,
planification, webhook), conditions, actions (voir le registre de
gestionnaires disponibles dans l'éditeur), avec les mêmes garanties de
fiabilité que les modèles fournis (files d'attente, verrous, retries,
file de lettres mortes en cas d'échec persistant).
