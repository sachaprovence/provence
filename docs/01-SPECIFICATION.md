# Provence 360 — Spécification fonctionnelle (MVP)

## 1. Objectifs

Fournir à Provence 360 un outil interne d'acquisition client automatisée qui couvre
tout le cycle : prospection → qualification → message → séquence → réponse →
rendez-vous → devis → client → mission, avec mesure de performance, tout en
respectant des garde-fous anti-spam et RGPD stricts (pas de contournement de
CAPTCHA/anti-bot, données saisies/CSV/API officielles uniquement).

Le logiciel est conçu pour être utilisé en interne d'abord, puis pour évoluer vers
un SaaS multi-organisation (le modèle de données est déjà multi-tenant via
`Organization`).

## 2. Utilisateurs et rôles

- **Administrateur** — configuration de l'entreprise, des utilisateurs, des
  intégrations, des règles de scoring/automatisation, accès à toutes les données
  de l'organisation.
- **Commercial** — consulte/qualifie ses prospects, valide les messages, gère
  rendez-vous, notes, devis, consulte ses propres performances.
- **Prestataire régional** — voit uniquement les missions et prospects de son
  territoire, accepte/refuse une mission, met à jour l'avancement, dépose les
  livrables.

Ces rôles sont portés par `Membership.role` (enum `OWNER_ADMIN`, `SALES`,
`PROVIDER`), rattaché à une `Organization`. Toute requête serveur vérifie le rôle
et l'appartenance à l'organisation (isolation multi-tenant stricte).

## 3. Parcours principal (golden path du MVP)

1. Connexion (compte de démonstration fourni en seed).
2. Import CSV d'une liste de prospects (avec aperçu, mapping de colonnes,
   détection de doublons).
3. Analyse automatique d'un prospect (`AIProvider.analyzeLead`, fournisseur simulé
   par défaut) → résumé, angle commercial, signaux, distinction
   vérifié/estimé/manquant.
4. Calcul du score (`LeadScore`, moteur de règles configurable en base).
5. Génération d'un message personnalisé (email de premier contact, ton +
   langue configurables) → statut `PENDING_VALIDATION`.
6. Validation humaine du message par un commercial (obligatoire par défaut).
7. Inscription du prospect dans une séquence (`Enrollment`).
8. Envoi simulé (`EmailProvider` simulé, respect des limites quotidiennes et de
   la liste d'exclusion) → `Message` + `EmailEvent(SENT)`.
9. Simulation d'une réponse entrante → classification d'intention
   (`AIProvider.classifyReply`) → `Conversation`.
10. Arrêt automatique de la séquence dès réponse détectée
    (`AutomationRule` interne).
11. Déplacement automatique du prospect dans le pipeline (`Lead.stage`).
12. Création d'un rendez-vous, d'une opportunité et d'un devis depuis la fiche
    prospect.
13. Consultation des statistiques (dashboard, filtres par période).
14. Désinscription d'un prospect → `SuppressionEntry` → blocage définitif de tout
    envoi futur (vérifié à chaque tentative d'envoi et d'enrôlement).

## 4. Périmètre du MVP (inclus)

- Auth (inscription du premier compte = création d'organisation, connexion,
  reset mot de passe, rôles, journal de connexion).
- Configuration entreprise (profil, services, zones, ton, signature).
- Profils de client idéal (ICP) — CRUD.
- Import CSV + saisie manuelle de prospects, déduplication basique (email/tel).
- Analyse IA simulée + score configurable + recalcul manuel.
- Pipeline CRM (15 étapes) en vue tableau + Kanban ; carte simplifiée (liste
  géolocalisée avec ville/territoire, pas de tuiles cartographiques tierces
  pour éviter une dépendance payante — voir §6).
- Génération de messages (email premier contact + relance), validation humaine,
  3 tons, 5 langues (traduction simulée par le AIProvider démo).
- Séquences (étapes avec délai/canal/gabarit/heures autorisées), moteur
  d'exécution planifié (tâche interne, pas de file externe requise en local),
  arrêt automatique sur réponse/RDV/client/désinscription/adresse invalide.
- Fournisseur email : interface générique + implémentation simulée (in-app
  inbox), synchronisation envoyés/reçus, association à un prospect, détection
  d'intention, statut d'envoi.
- Rendez-vous, opportunités/devis (avec offres prédéfinies), missions
  (attribution prestataire régional).
- Automatisations : moteur de règles simple (déclencheur → action) avec les 7
  règles listées dans la demande, actives par défaut en mode démo.
- Dashboard + statistiques (compteurs, taux, filtres période/ville/catégorie/
  campagne/commercial).
- Liste d'exclusion, désinscription, lien de désinscription dans les emails,
  limites d'envoi quotidiennes, historique de consentement, audit log complet.
- Mode démonstration : providers simulés (email + IA), données de démo
  (organisation, ICP, prospects, campagne, séquence, réponses, stats).

## 5. Reporté après le MVP (hors périmètre v1)

- Connecteurs réels (Gmail/Outlook API, SMTP réel, LinkedIn, fournisseurs de
  données payants) — l'interface `EmailProvider`/`AIProvider` est prête, il
  suffit d'ajouter une implémentation.
- Vraie carte interactive (Mapbox/Leaflet) avec clustering — actuellement liste
  géolocalisée triable/filtrable.
- File de traitement distribuée (BullMQ/Redis) — actuellement scheduler
  in-process + endpoint cron documenté (compatible avec un vrai cron système ou
  Vercel Cron en prod).
- Notifications push/Slack, facturation SaaS multi-plan, i18n complète de
  l'UI (l'UI est en français ; la génération de messages, elle, supporte 5
  langues).
- App mobile, SSO/OAuth entreprise, 2FA.

## 6. Risques techniques principaux et décisions prises

- **File d'attente asynchrone** : plutôt que d'imposer Redis/BullMQ pour un
  MVP local, le traitement des séquences est réalisé par une route API
  idempotente (`/api/cron/process-sequences`) appelable par un cron système ou
  déclenchée manuellement depuis l'UI en mode démo. Simplicité > infrastructure
  pour un MVP auto-hébergeable en local avec `docker compose up`.
- **Carte des prospects** : une vraie carte nécessite une clé API tierce
  (Mapbox/Google Maps). Le MVP fournit une vue "carte" sous forme de liste
  groupée par ville/territoire avec un pseudo-placement (évite une dépendance
  payante en mode démo) ; le champ `Lead.latitude/longitude` existe déjà pour
  brancher une vraie carte ensuite.
- **IA** : couche `AIProvider` strictement côté serveur, clé API jamais
  exposée au navigateur ; un fournisseur simulé déterministe permet de faire
  fonctionner tout le parcours sans coût ni clé.
- **Email** : un fournisseur simulé stocke les emails "envoyés" en base et
  permet de simuler une réponse entrante depuis l'UI (bouton dans la fiche
  prospect, réservé aux comptes de démo/admin), ce qui permet de tester tout
  le cycle sans service externe.
