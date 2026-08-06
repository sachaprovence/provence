# Guide utilisateur — utiliser Autorun sans écrire de code

Ce guide couvre l'usage courant de l'application depuis l'interface, une
fois installée (voir [INSTALLATION.md](./INSTALLATION.md)). Aucune étape
ci-dessous ne nécessite d'ouvrir un terminal, un fichier de configuration
ou d'écrire une ligne de code.

## Sommaire

- [Créer un compte et une organisation](#créer-un-compte-et-une-organisation)
- [Découvrir Autorun (mode démo en un clic)](#découvrir-autorun-mode-démo-en-un-clic)
- [Inviter un utilisateur](#inviter-un-utilisateur)
- [Connecter Gmail et Google Calendar](#connecter-gmail-et-google-calendar)
- [Le tableau de bord unifié](#le-tableau-de-bord-unifié)
- [Créer et exécuter un workflow (sans JSON)](#créer-et-exécuter-un-workflow-sans-json)
- [Créer un agent IA, discuter avec lui, utiliser sa mémoire](#créer-un-agent-ia-discuter-avec-lui-utiliser-sa-mémoire)
- [Connecter Slack et Discord](#connecter-slack-et-discord)
- [Observabilité : logs, erreurs, coûts IA](#observabilité-logs-erreurs-coûts-ia)
- [Voir les statistiques](#voir-les-statistiques)

## Créer un compte et une organisation

Depuis la page de connexion, cliquer **Créer un compte** : nom de
l'organisation, prénom/nom, email, mot de passe, puis choix d'un plan
(Starter/Pro/Entreprise — voir [PLANS_AND_QUOTAS.md](./PLANS_AND_QUOTAS.md)).
Vous devenez automatiquement administrateur (`OWNER_ADMIN`) de votre
organisation. Vous êtes ensuite redirigé vers un parcours d'onboarding guidé
en 6 étapes (profil, équipe, outils, modèle d'automatisation, démonstration,
résultat) — voir [GETTING_STARTED.md](./GETTING_STARTED.md) pour le détail.
Ce parcours peut être quitté à tout moment et repris depuis `/onboarding`.

## Découvrir Autorun (mode démo en un clic)

Sur le **Tableau de bord**, tant qu'aucun agent IA personnalisé n'existe
encore dans votre workspace, un bouton **Découvrir Autorun** est affiché.
Un clic suffit pour provisionner, immédiatement et sans aucune saisie :

- une automatisation active (modèle "Nouveau prospect" + "Demande de
  devis"),
- un workflow actif déjà exécuté une première fois sous vos yeux,
- un agent IA personnalisé ("Assistant Découverte Autorun") avec une
  première conversation déjà engagée,
- 3 connecteurs simulés (Google Calendar, Slack, Discord) en statut démo.

Rejouer ce bouton une seconde fois ne duplique rien : chaque élément n'est
créé qu'une fois par organisation. C'est le point de départ recommandé pour
explorer toutes les fonctionnalités de ce guide sans configuration
préalable.

## Inviter un utilisateur

Depuis **Utilisateurs** (`/users`), ou depuis l'étape "Équipe" de
l'onboarding : renseigner l'email et le rôle de workspace souhaité
(`OWNER`, `ADMIN`, `MANAGER`, `COMMERCIAL`, `OPERATOR`, `ACCOUNTANT`,
`SUPPORT`, `VIEWER`). Un email d'invitation est envoyé (ou, si aucun
fournisseur email réel n'est configuré, le lien s'affiche directement à
l'écran pour être copié/collé). Le lien expire après 7 jours et peut être
révoqué avant acceptation depuis la même page.

## Connecter Gmail et Google Calendar

Depuis **Paramètres → Intégrations** (Gmail) ou **Connecteurs**
(`/connectors`, Google Calendar) : cliquer **Connecter Gmail** /
**Connecter Google Calendar**, qui ouvre l'écran d'autorisation Google
standard (OAuth2). Après acceptation, le connecteur passe au statut
**Connecté** et reste utilisable jusqu'à révocation manuelle. Sans cette
étape, les deux connecteurs restent en mode démonstration fonctionnel (les
emails/évènements sont simulés, jamais réellement envoyés) — rien n'est
bloqué en attendant que vous branchiez le vrai compte.

## Le tableau de bord unifié

Le **Tableau de bord** (`/dashboard`) réunit en une seule vue :

- **Vue d'ensemble Autorun** (v1.6) — nombre de workflows/automatisations
  actifs, exécutions récentes, agents IA personnalisés, entrées de mémoire,
  connecteurs configurés, erreurs récentes et notifications, en un coup
  d'œil pour tout le workspace.
- les indicateurs commerciaux existants (prospects, séquences, campagnes,
  rendez-vous, opportunités) et un lien **Autres tableaux de bord**
  (`/dashboards`) vers les vues spécialisées (Commercial, Production,
  Clients, Visites, Chiffre d'affaires, IA, Automatisations, Rendez-vous,
  Performance).

## Créer et exécuter un workflow (sans JSON)

1. Ouvrir **Workflows** (`/workflows`) → **Nouveau workflow**, ou cloner un
   modèle du catalogue (10 modèles prêts à l'emploi).
2. Dans l'éditeur visuel : glisser-déposer un bloc **Déclencheur** (un
   évènement applicatif, ex. "prospect créé"), un ou plusieurs blocs
   **Action** (envoyer un email, appeler un agent, créer une tâche...), et
   les relier entre eux par glisser-déposer des connecteurs des blocs.
3. **Enregistrer** — crée une nouvelle version versionnée du workflow.
4. **Activer** la version pour qu'elle réagisse réellement aux évènements,
   ou **Lancer manuellement** pour la tester tout de suite sans attendre
   l'évènement réel.
5. Le résultat de l'exécution (nœud par nœud, succès/échec, durée) est
   visible immédiatement sur la page de détail de l'exécution — aucune
   étape n'exige d'éditer le graphe en JSON.

## Créer un agent IA, discuter avec lui, utiliser sa mémoire

1. Ouvrir **Agents IA** (`/agents`) → **+ Créer un agent** : nom, modèle
   IA (fournisseur — démo par défaut, aucune clé requise pour essayer),
   outils autorisés (ex. date/heure, informations du workspace), et
   activation de la mémoire persistante.
2. Ouvrir l'agent créé → **Discuter** : une conversation s'ouvre, taper un
   message dans le champ "Écrivez votre message…" et **Envoyer**. L'agent
   répond immédiatement (fournisseur démo simulé, ou un vrai modèle si un
   fournisseur réel est configuré).
3. Si la mémoire est activée, chaque échange laisse un résumé persistant
   scopé à cet agent, réutilisé automatiquement lors des conversations
   suivantes (visible dans **Intelligence documentaire**,
   `/settings/knowledge`, pour un administrateur).
4. Un outil autorisé pour l'agent peut aussi être appelé explicitement
   depuis la conversation (bouton d'exécution d'outil) — le résultat
   apparaît comme un message "Outil" dans le fil de discussion, avec un
   historique complet consultable à tout moment.

## Connecter Slack et Discord

Depuis **Connecteurs** (`/connectors`) : coller l'URL de webhook entrant
Slack (`https://hooks.slack.com/services/...`) ou Discord
(`https://discord.com/api/webhooks/...`), puis **Connecter Slack** /
**Connecter Discord**. **Tester la connexion** envoie immédiatement un
message de test (limité à 5 tests toutes les 5 minutes par organisation) et
affiche le statut réel (Connecté / Erreur). **Déconnecter** vide la
configuration sans supprimer l'historique. La même page centralise
également Gmail, Google Calendar et Stripe (statut en lecture seule, réglé
au niveau du déploiement — voir [STRIPE_INTEGRATION.md](./STRIPE_INTEGRATION.md)).

## Observabilité : logs, erreurs, coûts IA

**Paramètres → Métriques** (`/settings/metrics`) affiche, avec une
actualisation automatique toutes les 30 secondes :

- le coût IA cumulé (par période, par agent),
- le taux d'échec d'envoi email et la latence moyenne des appels API,
- les **erreurs API récentes** (v1.6) — type, message, route, horodatage,
  sans quitter l'écran.

Le détail nœud-par-nœud (logs, durée, statut, tentatives) de chaque
exécution de workflow ou d'automatisation reste consultable depuis sa page
de détail respective (`/workflows`, `/automations`).

## Voir les statistiques

**Statistiques** (`/stats`) regroupe les indicateurs d'activité globaux
(prospects, conversions, revenus, performance des séquences) ; les
tableaux de bord spécialisés listés dans [le tableau de bord
unifié](#le-tableau-de-bord-unifié) approfondissent chaque domaine.
