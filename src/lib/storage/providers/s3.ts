import "server-only";
import crypto from "node:crypto";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { StorageProvider } from "../types";
import { assertKeyBelongsToOrganization } from "../key-guard";
import { validateUpload } from "../validation";

/**
 * Stockage S3 (ou compatible : MinIO, Cloudflare R2, Scaleway...) réel
 * (v1.1, AR-0162 ; téléchargement/suppression/délai/validation réels v1.2,
 * AR-0164) — signature AWS SigV4 calculée manuellement (algorithme
 * standard et documenté, HMAC-SHA256 chaîné) via `fetch()`, plutôt que le
 * SDK `aws-sdk`/`@aws-sdk/client-s3` (lourd, nombreuses dépendances
 * transitives) — même raisonnement que Stripe (ADR 0042) et
 * Sentry/Gmail/Outlook (ADR 0038/0040). Voir docs/adr/0043 et docs/adr/0045.
 *
 * Upload direct côté serveur (jamais côté navigateur) : évite toute
 * configuration CORS du bucket, cohérent avec le reste du projet où les
 * secrets ne quittent jamais le serveur. Compatible AWS S3 réel ET tout
 * endpoint compatible S3 (`STORAGE_S3_ENDPOINT`) : SigV4 est le mécanisme
 * d'authentification standard implémenté par tous (AWS, MinIO, R2,
 * Scaleway Object Storage).
 */

const DEFAULT_TIMEOUT_MS = 15000;
// SHA-256 de la chaîne vide — constante bien connue du protocole SigV4,
// requise pour signer une requête GET/DELETE sans corps.
const EMPTY_PAYLOAD_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function getTimeoutMs(): number {
  const raw = process.env.STORAGE_S3_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function requireConfig() {
  const bucket = process.env.STORAGE_S3_BUCKET;
  const region = process.env.STORAGE_S3_REGION;
  const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new ValidationError(
      "Stockage S3 non configuré : variables d'environnement STORAGE_S3_BUCKET/STORAGE_S3_REGION/STORAGE_S3_ACCESS_KEY_ID/STORAGE_S3_SECRET_ACCESS_KEY requises."
    );
  }
  const endpoint = process.env.STORAGE_S3_ENDPOINT || `https://${bucket}.s3.${region}.amazonaws.com`;
  const publicUrlBase = process.env.STORAGE_S3_PUBLIC_URL_BASE || endpoint;
  return { bucket, region, accessKeyId, secretAccessKey, endpoint, publicUrlBase };
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function sanitizeKey(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

/** Construit l'URL et les en-têtes signés SigV4 pour une requête S3 (PUT/GET/DELETE) sur `key`. */
function buildSignedRequest(
  method: "PUT" | "GET" | "DELETE",
  key: string,
  payloadHash: string,
  contentType: string | undefined,
  config: ReturnType<typeof requireConfig>
): { url: string; headers: Record<string, string> } {
  const { region, accessKeyId, secretAccessKey, endpoint } = config;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = new URL(endpoint).host;

  const headerLines = contentType
    ? `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
    : `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = contentType ? "content-type;host;x-amz-content-sha256;x-amz-date" : "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, `/${key}`, "", headerLines, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const signingKeyBytes = signingKey(secretAccessKey, dateStamp, region, "s3");
  const signature = crypto.createHmac("sha256", signingKeyBytes).update(stringToSign, "utf8").digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "X-Amz-Content-Sha256": payloadHash,
    "X-Amz-Date": amzDate,
    Authorization: authorization,
  };
  if (contentType) headers["Content-Type"] = contentType;

  return { url: `${endpoint}/${key}`, headers };
}

/**
 * Exécute une requête S3 signée avec un délai maximal (`STORAGE_S3_TIMEOUT_MS`,
 * défaut 15s) — un bucket/endpoint injoignable ne doit jamais bloquer
 * indéfiniment une requête applicative (upload/téléchargement/suppression
 * de pièce jointe). Distingue explicitement timeout vs erreur réseau vs
 * réponse d'erreur S3 pour un diagnostic clair côté logs (jamais de secret
 * dans le message : ni les identifiants, ni la signature, qui ne
 * transitent que dans des en-têtes non journalisés ici).
 */
async function s3Fetch(
  method: "PUT" | "GET" | "DELETE",
  key: string,
  options: { payloadHash: string; contentType?: string; body?: Uint8Array }
): Promise<Response> {
  const config = requireConfig();
  const { url, headers } = buildSignedRequest(method, key, options.payloadHash, options.contentType, config);

  const controller = new AbortController();
  const timeoutMs = getTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { method, headers, body: options.body as BodyInit | undefined, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Délai dépassé (${timeoutMs} ms) lors de l'appel au stockage S3 (${method} ${key}).`);
    }
    throw new Error(
      `Erreur réseau lors de l'appel au stockage S3 (${method} ${key}) : ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timeout);
  }
}

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";

  async upload(params: { organizationId: string; fileName: string; mimeType: string; data: Buffer }): Promise<{ url: string; key: string }> {
    validateUpload({ fileName: params.fileName, mimeType: params.mimeType, sizeBytes: params.data.byteLength });

    const { publicUrlBase } = requireConfig();
    const key = `${params.organizationId}/${crypto.randomUUID()}-${sanitizeKey(params.fileName)}`;
    const payloadHash = sha256Hex(params.data);

    const response = await s3Fetch("PUT", key, {
      payloadHash,
      contentType: params.mimeType,
      body: new Uint8Array(params.data),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Échec de l'upload S3 (${response.status}) : ${body}`);
    }

    return { url: `${publicUrlBase}/${key}`, key };
  }

  async download(params: { organizationId: string; key: string }): Promise<{ data: Buffer; mimeType: string }> {
    assertKeyBelongsToOrganization(params.key, params.organizationId);

    const response = await s3Fetch("GET", params.key, { payloadHash: EMPTY_PAYLOAD_HASH });

    if (response.status === 404) {
      throw new NotFoundError("Fichier introuvable dans le stockage S3.");
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Échec du téléchargement S3 (${response.status}) : ${body}`);
    }

    const data = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "application/octet-stream";
    return { data, mimeType };
  }

  async delete(params: { organizationId: string; key: string }): Promise<void> {
    assertKeyBelongsToOrganization(params.key, params.organizationId);

    // DELETE S3 est idempotent par nature (204 même si l'objet n'existe déjà
    // plus) — aucun cas 404 particulier à distinguer, contrairement à GET.
    const response = await s3Fetch("DELETE", params.key, { payloadHash: EMPTY_PAYLOAD_HASH });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Échec de la suppression S3 (${response.status}) : ${body}`);
    }
  }

  /**
   * Test de connexion en lecture seule pour l'écran de diagnostic (v1.2,
   * AR-0165) — un GET signé sur une clé délibérément inexistante prouve
   * l'authentification ET l'accessibilité du bucket sans jamais lire ni
   * écrire de donnée applicative réelle : 404 = authentification valide,
   * bucket joignable (l'objet, lui, n'existe simplement pas) ; 403 =
   * identifiants/permissions invalides ; toute autre réponse est traitée
   * comme un échec explicite plutôt qu'un succès supposé.
   */
  async testConnection(): Promise<{ status: "TEST_SUCCESS" | "TEST_FAILED" | "UNAVAILABLE"; message: string }> {
    try {
      const probeKey = `__provence_diagnostic_check__/${crypto.randomUUID()}`;
      const response = await s3Fetch("GET", probeKey, { payloadHash: EMPTY_PAYLOAD_HASH });
      if (response.status === 404) return { status: "TEST_SUCCESS", message: "Connexion établie (bucket accessible, authentification valide)." };
      if (response.ok) return { status: "TEST_SUCCESS", message: "Connexion établie." };
      if (response.status === 403) return { status: "TEST_FAILED", message: "Accès refusé par S3 (403) — identifiants ou permissions du bucket invalides." };
      return { status: "TEST_FAILED", message: `S3 a répondu ${response.status}.` };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur réseau.";
      return { status: "UNAVAILABLE", message };
    }
  }
}
