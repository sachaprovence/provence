FROM node:22-alpine AS base
WORKDIR /app
# `tini` (v1.2, AR-0169) : processus d'initialisation minimal en PID 1 —
# relaie correctement SIGTERM au process Next.js (arrêt propre, requêtes
# en cours drainées) ET réclame les processus zombies éventuels. Sans lui,
# `sh -c "cmd1 && cmd2"` (voir CMD ci-dessous) ne relaie PAS SIGTERM à
# `cmd2` par défaut — `docker stop` attendrait le délai de grâce complet
# puis tuerait brutalement (SIGKILL) plutôt qu'un arrêt propre.
RUN apk add --no-cache libc6-compat openssl tini

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://provence:provence@db:5432/provence360?schema=public"
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/next.config.ts ./next.config.ts


# Créé explicitement AVANT le chown (v1.2, AR-0169) : un volume Docker
# nommé monté sur un point de montage absent de l'image serait initialisé
# root:root par le moteur Docker, inutilisable en écriture par l'utilisateur
# non-root `nextjs` — voir `storage-demo` dans docker-compose.yml.
RUN mkdir -p /app/storage-demo && chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
ENV PORT=3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health/ready || exit 1

# `tini` en PID 1 (v1.2, AR-0169) : relaie SIGTERM/SIGINT au bon
# descendant et réclame les processus zombies — voir le commentaire sur
# son installation ci-dessus.
ENTRYPOINT ["/sbin/tini", "--"]
# `exec` avant `next start` (v1.2, AR-0169) : remplace le process shell
# par le process Node.js au lieu de le lancer comme enfant — sans cela,
# même sous `tini`, un signal reçu par `sh` n'est PAS automatiquement
# transmis à `next start`, qui continuerait de traiter des requêtes
# pendant l'arrêt du conteneur (perte de requêtes en cours, jamais un arrêt
# propre). `prisma migrate deploy` s'exécute d'abord et se termine
# normalement (jamais `exec`é lui-même) avant que `next start` ne devienne
# le process principal.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node_modules/.bin/next start -p 3000"]
