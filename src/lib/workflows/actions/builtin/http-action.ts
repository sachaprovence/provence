import "server-only";
import { ValidationError } from "@/lib/errors";
import type { WorkflowActionHandler } from "../registry";

type HttpCallInput = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
};

type HttpCallOutput = { status: number; ok: boolean; body: unknown };

const DEFAULT_HTTP_TIMEOUT_MS = 15_000;

export const httpCallApiAction: WorkflowActionHandler<HttpCallInput, HttpCallOutput> = {
  key: "http.call_api",
  name: "Appeler une API",
  description: "Effectue un appel HTTP sortant générique (GET/POST/PUT/PATCH/DELETE).",
  category: "intégration",
  async execute(input) {
    if (!input.url) throw new ValidationError('L\'action "http.call_api" nécessite "url".');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS);
    try {
      const response = await fetch(input.url, {
        method: input.method ?? "GET",
        headers: input.headers,
        body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
        signal: controller.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";
      const body = contentType.includes("application/json") ? await response.json() : await response.text();
      return { status: response.status, ok: response.ok, body };
    } finally {
      clearTimeout(timer);
    }
  },
};
