// Patch de résolution CommonJS (Node `--require`, voir `package.json#db:seed`)
// qui redirige UNIQUEMENT le spécificateur `server-only` vers un stub inerte
// pendant l'exécution de `prisma/seed.ts` — `bootstrap.ts` importe
// `src/lib/crm/pipeline-service.ts`, qui déclare `import "server-only"`
// (protection normale d'un module Next.js Server Component). `tsx` exécute
// ce script en CommonJS (pas de `"type": "module"` dans `package.json`), donc
// via `require()`, pas via le chargeur ESM — un hook `module.register` seul
// ne suffirait pas, d'où ce patch direct de `Module._resolveFilename`.
// Portée strictement limitée à ce script : n'affecte jamais le build Next.js
// réel (qui ne charge jamais ce fichier).
const Module = require("node:module");
const path = require("node:path");

const stubPath = path.join(__dirname, "seed-server-only-stub.cjs");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, ...rest) {
  if (request === "server-only") return stubPath;
  return originalResolveFilename.call(this, request, ...rest);
};
