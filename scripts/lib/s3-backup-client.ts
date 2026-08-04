import crypto from "node:crypto";

/**
 * Client S3 bas-niveau RÉSERVÉ AUX SCRIPTS DE SAUVEGARDE (v1.2, AR-0166) —
 * volontairement séparé de `src/lib/storage/providers/s3.ts` (l'API
 * applicative, org-scopée, jamais destinée à lister/lire/écrire en dehors
 * du périmètre d'une organisation) : un script de sauvegarde a
 * légitimement besoin d'un accès administratif à TOUT le bucket (lister
 * tous les objets, toutes organisations confondues), ce que l'application
 * ne doit JAMAIS pouvoir faire depuis une route HTTP. Garder cette
 * capacité hors de `src/lib/storage/` évite qu'un futur appel applicatif
 * l'utilise par erreur.
 *
 * Même convention "pas de SDK" que `s3.ts` (SigV4 manuel via `fetch()`),
 * étendue au cas d'une requête `GET` sur la racine du bucket (`ListObjectsV2`,
 * avec chaîne de requête à signer) plutôt que sur une clé d'objet précise.
 */
const DEFAULT_TIMEOUT_MS = 30000;
const EMPTY_PAYLOAD_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export interface S3BackupConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
}

export function requireS3BackupConfig(): S3BackupConfig {
  const bucket = process.env.STORAGE_S3_BUCKET;
  const region = process.env.STORAGE_S3_REGION;
  const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Stockage S3 non configuré : variables d'environnement STORAGE_S3_BUCKET/STORAGE_S3_REGION/STORAGE_S3_ACCESS_KEY_ID/STORAGE_S3_SECRET_ACCESS_KEY requises pour sauvegarder/restaurer les objets S3."
    );
  }
  const endpoint = process.env.STORAGE_S3_ENDPOINT || `https://${bucket}.s3.${region}.amazonaws.com`;
  return { bucket, region, accessKeyId, secretAccessKey, endpoint };
}

function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function signingKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

/** Encodage RFC 3986 strict (SigV4 exige que `!*'()` soient aussi encodés, contrairement à `encodeURIComponent`). */
function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQueryString(query: Record<string, string>): string {
  return Object.keys(query)
    .sort()
    .map((k) => `${rfc3986Encode(k)}=${rfc3986Encode(query[k])}`)
    .join("&");
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

/** Requête signée générique — `key` vide = racine du bucket (listage), `key` renseignée = objet précis (get/put). */
function buildSignedRequest(
  method: "GET" | "PUT" | "DELETE",
  config: S3BackupConfig,
  key: string,
  query: Record<string, string>,
  payloadHash: string,
  contentType?: string
): SignedRequest {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = new URL(config.endpoint).host;
  const canonicalUri = key ? `/${key}` : "/";

  const headerLines = contentType
    ? `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
    : `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = contentType ? "content-type;host;x-amz-content-sha256;x-amz-date" : "host;x-amz-content-sha256;x-amz-date";
  const canonicalQuery = canonicalQueryString(query);
  const canonicalRequest = [method, canonicalUri, canonicalQuery, headerLines, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const signingKeyBytes = signingKey(config.secretAccessKey, dateStamp, config.region);
  const signature = crypto.createHmac("sha256", signingKeyBytes).update(stringToSign, "utf8").digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "X-Amz-Content-Sha256": payloadHash,
    "X-Amz-Date": amzDate,
    Authorization: authorization,
  };
  if (contentType) headers["Content-Type"] = contentType;

  const queryPart = canonicalQuery ? `?${canonicalQuery}` : "";
  return { url: `${config.endpoint}${canonicalUri}${queryPart}`, headers };
}

async function s3BackupFetch(
  method: "GET" | "PUT" | "DELETE",
  config: S3BackupConfig,
  key: string,
  query: Record<string, string>,
  options: { payloadHash: string; contentType?: string; body?: Uint8Array }
): Promise<Response> {
  const { url, headers } = buildSignedRequest(method, config, key, query, options.payloadHash, options.contentType);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { method, headers, body: options.body as BodyInit | undefined, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Délai dépassé (${DEFAULT_TIMEOUT_MS} ms) lors de l'appel au stockage S3 (${method} ${key || "/"}).`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export interface S3ObjectSummary {
  key: string;
  sizeBytes: number;
  etag: string;
}

/** Extraction minimale par expression régulière (pas de dépendance XML) — suffisant pour la structure fixe de la réponse `ListObjectsV2`. */
function parseListObjectsResponse(xml: string): { objects: S3ObjectSummary[]; isTruncated: boolean; nextContinuationToken?: string } {
  const objects: S3ObjectSummary[] = [];
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;
  while ((match = contentsRegex.exec(xml))) {
    const block = match[1];
    const key = /<Key>(.*?)<\/Key>/.exec(block)?.[1];
    const size = /<Size>(\d+)<\/Size>/.exec(block)?.[1];
    const etag = /<ETag>(.*?)<\/ETag>/.exec(block)?.[1] ?? "";
    if (key) objects.push({ key: decodeXmlEntities(key), sizeBytes: Number(size ?? 0), etag });
  }
  const isTruncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const nextToken = /<NextContinuationToken>(.*?)<\/NextContinuationToken>/.exec(xml)?.[1];
  return { objects, isTruncated, nextContinuationToken: nextToken ? decodeXmlEntities(nextToken) : undefined };
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

/** Liste TOUS les objets du bucket (pagination `ListObjectsV2` suivie jusqu'au bout) — accès administratif, jamais exposé à l'application. */
export async function listAllObjects(config: S3BackupConfig, prefix = ""): Promise<S3ObjectSummary[]> {
  const objects: S3ObjectSummary[] = [];
  let continuationToken: string | undefined;

  do {
    const query: Record<string, string> = { "list-type": "2", "max-keys": "1000" };
    if (prefix) query.prefix = prefix;
    if (continuationToken) query["continuation-token"] = continuationToken;

    const response = await s3BackupFetch("GET", config, "", query, { payloadHash: EMPTY_PAYLOAD_HASH });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Échec du listage S3 (${response.status}) : ${body.slice(0, 500)}`);
    }
    const xml = await response.text();
    const parsed = parseListObjectsResponse(xml);
    objects.push(...parsed.objects);
    continuationToken = parsed.isTruncated ? parsed.nextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

export async function getObject(config: S3BackupConfig, key: string): Promise<{ data: Buffer; contentType: string }> {
  const response = await s3BackupFetch("GET", config, key, {}, { payloadHash: EMPTY_PAYLOAD_HASH });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Échec du téléchargement S3 (${response.status}) pour "${key}" : ${body.slice(0, 500)}`);
  }
  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  return { data, contentType };
}

/** Écrit à la clé EXACTE fournie (contrairement à `S3StorageProvider.upload()`, qui génère toujours une nouvelle clé) — nécessaire pour restaurer un objet à son emplacement d'origine. */
export async function putObjectAtKey(config: S3BackupConfig, key: string, data: Buffer, contentType: string): Promise<void> {
  const payloadHash = sha256Hex(data);
  const response = await s3BackupFetch("PUT", config, key, {}, { payloadHash, contentType, body: new Uint8Array(data) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Échec de l'écriture S3 (${response.status}) pour "${key}" : ${body.slice(0, 500)}`);
  }
}

/** Suppression administrative par clé exacte — réservée au nettoyage des copies de vérification (voir `verify-s3-backup.ts`), jamais à un objet réel d'organisation. */
export async function deleteObjectAtKey(config: S3BackupConfig, key: string): Promise<void> {
  const response = await s3BackupFetch("DELETE", config, key, {}, { payloadHash: EMPTY_PAYLOAD_HASH });
  if (!response.ok && response.status !== 404) {
    const body = await response.text().catch(() => "");
    throw new Error(`Échec de la suppression S3 (${response.status}) pour "${key}" : ${body.slice(0, 500)}`);
  }
}

export function sha256HexOf(data: Buffer): string {
  return sha256Hex(data);
}
