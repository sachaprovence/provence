// Sous Vitest (Node pur), le paquet réel `server-only` lève toujours une
// exception car il s'appuie sur une condition d'export ("react-server")
// posée par le bundler de Next.js, absente ici. On le neutralise donc pour
// les tests uniquement (voir alias dans vitest.config.ts) : la protection
// réelle contre un import côté client reste active dans le build Next.js.
export {};
