# ADR 0040 — v0.9 bis : observabilité réelle, quota IA dur partagé, connecteurs Gmail/Outlook réels

- **Date** : 2026-08-03
- **Statut** : accepté

## Contexte

v0.9 ("Provence 360 Operating System", ADR 0038/0039) a livré le CRM
complet, 7 agents métier, les intégrations SMTP/Resend/Postmark/Brevo et
Google Calendar. Le plan initial de v0.9 listait cependant des tâches
(AR-0047 à AR-0054) volontairement reportées, faute de temps :
observabilité réelle (logs/erreurs/métriques), un vrai fournisseur
Anthropic pour la couche IA historique, un quota IA dur, et deux
connecteurs email supplémentaires (Gmail, Outlook). v0.9 bis les traite
intégralement.

Avant d'écrire du code, un état des lieux du code (pas seulement de la
roadmap) a établi que deux tâches étaient déjà satisfaites ailleurs :

- **AR-0047** (logs structurés) : `src/lib/logger.ts` (pino, redaction,
  interdiction ESLint de `console.log` brut dans `src/`) existait déjà
  depuis une phase antérieure à v0.9 bis — il ne manquait qu'un test de
  non-régression prouvant que la redaction fonctionne réellement.
- **AR-0052** (`SmtpEmailProvider`) : déjà livré via `AR-0145` (v0.9,
  sous une forme étendue à Resend/Postmark/Brevo et à la configuration
  par organisation).

Le reste (AR-0048/0049/0050/0051/0053/0054) constitue le travail réel de
cette version.

## Décision

### Capture d'erreurs (AR-0048) : appel HTTP direct au protocole "envelope" de Sentry, jamais le SDK `@sentry/node`

Même convention que les fournisseurs LLM/email/Calendar (ADR 0038) :
jamais un SDK tiers lourd pour un besoin qui se réduit à un appel HTTP
documenté publiquement. `src/lib/observability/error-tracking.ts` construit
et envoie l'enveloppe Sentry via `fetch()` nu. Le choix d'activer la
capture (`SENTRY_DSN`) est un réglage de DÉPLOIEMENT, jamais par
organisation — même principe que le choix du fournisseur IA/LLM (ADR
0015/0039), à la différence des identifiants email/calendrier qui SONT
par organisation. Sans DSN configuré, `captureException` échoue
explicitement (`{captured: false, reason}`) — jamais un faux succès — et
le journal structuré (AR-0047) reste dans tous les cas la source de
vérité première, appelé systématiquement que Sentry soit configuré ou non.

### Métriques de base (AR-0049) : latence API en extension incrémentale, jamais un middleware global

Coût IA et taux d'échec email réutilisent des données déjà journalisées
(`AIRequest.estimatedCostUsd` depuis v0.3, jamais agrégé ; `EmailEvent`
depuis v0.1, jamais agrégé). La latence API est la seule mesure
réellement nouvelle : plutôt qu'un middleware Next.js global sur TOUTES
les routes (risque de régression disproportionné pour cette phase —
`src/middleware.ts` n'existe pas encore dans le projet), décision
d'un petit assistant explicite (`withApiMetrics`) appliqué route par
route, en commençant par 3 routes représentatives
(`/api/leads`, `/api/messages/generate`, `/api/quotes`). Extensible sans
changement d'architecture — chaque route supplémentaire s'ajoute par un
simple `export const GET = withApiMetrics(...)`.

### Couche IA historique vs Framework des Agents : deux abstractions distinctes, jamais fusionnées (AR-0050/0051)

`src/lib/ai/` (interface `AIProvider`, 8 méthodes structurées :
`analyzeLead`, `generateMessage`, `classifyReply`...) et
`src/lib/agents/llm/` (interface `LlmProvider`, `complete()` texte brut,
utilisée par `generateAgentNarrative` pour les 8 agents) sont deux
abstractions VOLONTAIREMENT séparées, servant des périmètres différents :
la première alimente le cœur CRM historique (scoring/génération de
message/classification de réponse, actif depuis v0.1), la seconde le
Framework des Agents (v0.4+). `AR-0050` implémente un vrai
`AnthropicAIProvider` pour la PREMIÈRE uniquement — la seconde a déjà son
propre `AnthropicProvider` réel (`src/lib/agents/llm/providers/
anthropic.ts`, livré lors d'une phase antérieure). Confondre les deux
aurait fait considérer `AR-0050` comme "déjà fait" à tort.

Le fournisseur Anthropic pour `src/lib/ai/` doit renvoyer des données
STRUCTURÉES (pas juste du texte) : il demande donc à Claude un objet JSON
strict par méthode, le parse et le normalise (valeurs par défaut sûres si
un champ optionnel manque ; `classifyReply` retombe sur
`ReplyIntent.UNKNOWN` si la valeur renvoyée n'appartient pas à
l'énumération), échouant explicitement si la réponse n'est pas
exploitable — jamais un résultat fabriqué.

**AR-0051 (quota IA dur)** révèle un manque préexistant en creusant
cette distinction : le champ `AIRequest.agentRunId`, conçu depuis une
phase antérieure précisément pour rattacher un appel IA du Framework des
Agents à son exécution (voir le commentaire déjà présent dans le schéma),
n'était en réalité JAMAIS renseigné — `generateAgentNarrative` n'écrivait
aucune ligne `AIRequest`. Un quota qui n'aurait couvert que la couche
`src/lib/ai/` aurait donc été un faux sentiment de contrôle : un agent
métier aurait pu consommer un budget IA illimité sans jamais être compté.
Décision : `generateAgentNarrative` (point d'entrée UNIQUE partagé par
les 7 agents métier + Commercial, voir tâche #25 v0.6) vérifie désormais
le quota AVANT tout appel LLM et journalise une ligne `AIRequest`
(nouveau `AIRequestKind.AGENT_NARRATIVE`, coût estimé génériquement — le
fournisseur actif pouvant être n'importe lequel des 8 enregistrés,
`estimateGenericAiCostUsd` ne peut donc pas être spécifique à un
fournisseur). Les deux couches partagent ainsi le même budget mensuel par
organisation (`Organization.aiMonthlyBudgetUsd`, `null` = illimité,
comportement inchangé pour toute organisation existante).

### Connecteurs OAuth2 : un module générique PAR fournisseur d'identité, jamais dupliqué dans chaque intégration (AR-0053/0054)

Google Calendar (v0.9) avait déjà un client OAuth2 fonctionnel, mais
spécifique au scope Calendar (`src/lib/calendar/google/oauth.ts`). Plutôt
que de dupliquer cette logique (échange de code, renouvellement de
jeton) dans le nouveau fournisseur Gmail, elle a été extraite en un
module générique `src/lib/google/oauth.ts` (paramétré par `scope`) ;
`calendar/google/oauth.ts` délègue désormais à ce module en conservant
SES SIGNATURES D'ORIGINE EXACTES — zéro changement pour ses appelants
existants, vérifié par sa suite de tests v0.9 inchangée et toujours
verte. Le même principe s'applique à Microsoft (`src/lib/microsoft/
oauth.ts`, nouveau, pour Outlook/AR-0054) : un seul module par fournisseur
d'identité, réutilisable par une future intégration Microsoft (Teams,
SharePoint) sans duplication.

`GmailEmailProvider`/`OutlookEmailProvider` implémentent `EmailProvider`
(même interface que SMTP/Resend/Postmark/Brevo, v0.9), configuration par
organisation dans `Integration.config` (kind `EMAIL` : `clientId`/
`clientSecret`/`refreshToken`, `tenantId` pour Outlook), sélectionnables
par `EMAIL_PROVIDER=gmail`/`outlook`. Comme les autres fournisseurs
réels : échec explicite (jamais un succès simulé) sans configuration ou
en cas d'erreur réseau/HTTP. La vérification de bout en bout contre un
vrai compte Gmail/Microsoft 365 n'a pas été possible dans cet
environnement (aucun identifiant OAuth disponible) — vérifié à la place
contre de vrais petits serveurs HTTP locaux simulant les endpoints
Google/Microsoft (même méthode que Google Calendar/Resend/Postmark/Brevo,
ADR 0038).

## Conséquences

- Le Framework des Agents journalise désormais un coût IA réel (jamais
  fait jusqu'ici) — les métriques de coût IA (AR-0049) et les futurs
  tableaux de bord incluent maintenant les 7 agents métier + Commercial,
  pas seulement le cœur CRM historique.
- `Organization.aiMonthlyBudgetUsd` est additif (`null` par défaut) :
  aucune organisation existante n'est affectée tant qu'un quota n'est pas
  explicitement configuré.
- Deux nouvelles routes OAuth par fournisseur email (`connect`/`callback`)
  suivent exactement le gabarit déjà établi par Google Calendar — aucune
  nouvelle convention introduite.
- `src/lib/ai/providers/anthropic.ts` et
  `src/lib/agents/llm/providers/anthropic.ts` restent deux fichiers
  distincts par choix — les fusionner impliquerait de changer la nature
  de l'interface `AIProvider` (données structurées) ou `LlmProvider`
  (texte brut), un chantier hors périmètre de cette phase.

## Alternatives écartées

- **Middleware Next.js global pour la latence API** (AR-0049) : écarté —
  risque de régression sur TOUTES les routes existantes pour une valeur
  marginale à ce stade ; l'extension route-par-route (`withApiMetrics`)
  couvre le besoin réel sans ce risque.
- **SDK `@sentry/node`** (AR-0048) : écarté — même raisonnement que les
  fournisseurs LLM/email déjà réels (ADR 0038) : une dépendance lourde
  pour un simple appel HTTP documenté publiquement.
- **Fusionner `src/lib/ai/` et `src/lib/agents/llm/` en une seule
  abstraction IA** (AR-0050) : écarté — les deux servent des contrats de
  données différents (structuré vs texte brut) et des périmètres
  d'appelants différents ; les fusionner casserait la compatibilité de
  tous les appelants existants des deux côtés pour un bénéfice non
  demandé par le brief.
- **Quota IA vérifié uniquement à l'écriture d'`AIRequest` (a posteriori)**
  (AR-0051) : écarté — un contrôle a posteriori n'empêche jamais le
  dépassement, seulement le constate ; le brief demande explicitement un
  quota BLOQUANT, vérifié avant l'appel.
- **`googleapis`/SDK Microsoft Graph officiels** (AR-0053/0054) : écartés
  — même principe que Google Calendar (ADR 0038), `fetch()` direct contre
  des API REST documentées publiquement suffit et évite une dépendance
  lourde supplémentaire.
