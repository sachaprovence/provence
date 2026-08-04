import "server-only";
import crypto from "node:crypto";
import { ValidationError } from "@/lib/errors";
import type { StorageProvider } from "../types";

/**
 * Stockage S3 (ou compatible : MinIO, Cloudflare R2, Scaleway...) réel
 * (v1.1, AR-0162) — signature AWS SigV4 calculée manuellement (algorithme
 * standard et documenté, HMAC-SHA256 chaîné) via `fetch()`, plutôt que le
 * SDK `aws-sdk`/`@aws-sdk/client-s3` (lourd, nombreuses dépendances
 * transitives) — même raisonnement que Stripe (ADR 0042) et
 * Sentry/Gmail/Outlook (ADR 0038/0040). Voir docs/adr/0043.
 *
 * Upload direct côté serveur (jamais côté navigateur) : évite toute
 * configuration CORS du bucket, cohérent avec le reste du projet où les
 * secrets ne quittent jamais le serveur.
 */

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

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";

  async upload(params: { organizationId: string; fileName: string; mimeType: string; data: Buffer }): Promise<{ url: string }> {
    const { region, accessKeyId, secretAccessKey, endpoint, publicUrlBase } = requireConfig();
    const key = `${params.organizationId}/${crypto.randomUUID()}-${sanitizeKey(params.fileName)}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const host = new URL(endpoint).host;
    const payloadHash = sha256Hex(params.data);

    const canonicalHeaders = `content-type:${params.mimeType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = ["PUT", `/${key}`, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

    const signingKeyBytes = signingKey(secretAccessKey, dateStamp, region, "s3");
    const signature = crypto.createHmac("sha256", signingKeyBytes).update(stringToSign, "utf8").digest("hex");

    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`${endpoint}/${key}`, {
      method: "PUT",
      headers: {
        "Content-Type": params.mimeType,
        "X-Amz-Content-Sha256": payloadHash,
        "X-Amz-Date": amzDate,
        Authorization: authorization,
      },
      body: new Uint8Array(params.data),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Échec de l'upload S3 (${response.status}) : ${body}`);
    }

    return { url: `${publicUrlBase}/${key}` };
  }
}
