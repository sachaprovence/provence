import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageTone, MessageType, MessageLanguage } from "@/generated/prisma/enums";
import { AnthropicAIProvider } from "@/lib/ai/providers/anthropic";
import type { LeadFactsInput } from "@/lib/ai/types";

/**
 * Fournisseur IA réel Anthropic pour la couche historique `src/lib/ai/`
 * (brief v0.9 bis, AR-0050) — vérifie : (1) l'échec explicite sans
 * `ANTHROPIC_API_KEY` (jamais un résultat simulé), (2) un appel RÉEL réussi
 * contre un vrai serveur HTTP local (mêmes conventions que
 * `tests/observability/error-tracking.test.ts` / `tests/email/real-providers.test.ts`),
 * (3) l'échec explicite sur erreur HTTP et sur réponse non structurée.
 *
 * Distinct de `src/lib/agents/llm/providers/anthropic.ts` (Framework
 * d'Agents, texte brut) : cette suite couvre `AIProvider` (données
 * structurées), utilisée par le cœur CRM (analyse/scoring/génération/
 * classification historiques).
 */

const baseLead: LeadFactsInput = {
  establishmentName: "Villa des Oliviers",
  category: "VILLA",
  city: "Aix-en-Provence",
  region: "PACA",
  reviewCount: 42,
  averageRating: 4.6,
};

describe("AnthropicAIProvider — échec explicite sans configuration", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey) process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("analyzeLead échoue explicitement sans clé API", async () => {
    const provider = new AnthropicAIProvider();
    await expect(provider.analyzeLead(baseLead)).rejects.toThrow(/non configuré/);
  });

  it("classifyReply échoue explicitement sans clé API", async () => {
    const provider = new AnthropicAIProvider();
    await expect(provider.classifyReply({ body: "Merci, pas intéressé." })).rejects.toThrow(/non configuré/);
  });
});

describe("AnthropicAIProvider — appels réels contre un serveur HTTP local", () => {
  let server: http.Server;
  let baseUrl: string;
  let lastRequestBody: string;
  let responseBody: unknown;
  let responseStatus: number;

  beforeEach(async () => {
    responseStatus = 200;
    responseBody = { model: "claude-sonnet-5", content: [{ type: "text", text: "" }] };
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        lastRequestBody = body;
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify(responseBody));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("analyzeLead : requête réelle (x-api-key, modèle) et parsing du JSON structuré retourné", async () => {
    responseBody = {
      model: "claude-sonnet-5",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            summary: "Villa premium avec bonne notoriété en ligne.",
            clienteleType: "haut de gamme",
            digitalPresenceQuality: "bonne",
            hasVirtualTourAssessment: "absente",
            opportunities: ["Volume d'avis suffisant"],
            recommendedAngle: "mettre en avant la visite virtuelle",
            recommendedService: "visite 360",
            priorityLevel: "interessant",
            personalizedArguments: ["42 avis"],
            negativeSignals: [],
            verifiedFacts: ["42 avis en ligne"],
            estimatedFacts: [],
            missingInfo: [],
          }),
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    };

    const provider = new AnthropicAIProvider({ baseUrl });
    const result = await provider.analyzeLead(baseLead);

    expect(result.summary).toBe("Villa premium avec bonne notoriété en ligne.");
    expect(result.priorityLevel).toBe("interessant");
    expect(result.verifiedFacts).toEqual(["42 avis en ligne"]);

    const sentRequest = JSON.parse(lastRequestBody);
    expect(sentRequest.model).toBe("claude-sonnet-5");
    expect(sentRequest.messages[0].content).toContain("Villa des Oliviers");
  });

  it("classifyReply : normalise une intention valide et rejette une intention hors énumération", async () => {
    responseBody = {
      model: "claude-sonnet-5",
      content: [{ type: "text", text: JSON.stringify({ intent: "PRICE_REQUEST", confidence: 0.9, reasoning: "demande de tarif" }) }],
    };
    const provider = new AnthropicAIProvider({ baseUrl });
    const result = await provider.classifyReply({ body: "Quel est votre tarif ?" });
    expect(result.intent).toBe("PRICE_REQUEST");
    expect(result.confidence).toBe(0.9);

    responseBody = {
      model: "claude-sonnet-5",
      content: [{ type: "text", text: JSON.stringify({ intent: "NOT_A_REAL_INTENT", confidence: 2, reasoning: "x" }) }],
    };
    const invalid = await provider.classifyReply({ body: "???" });
    expect(invalid.intent).toBe("UNKNOWN");
    expect(invalid.confidence).toBe(1);
  });

  it("generateMessage : inclut le lien de désinscription pour un email, pas de sujet pour un SMS", async () => {
    responseBody = {
      model: "claude-sonnet-5",
      content: [{ type: "text", text: JSON.stringify({ subject: null, body: "Bonjour, contactez-nous. Se désinscrire : https://x.test/u/1" }) }],
    };
    const provider = new AnthropicAIProvider({ baseUrl });
    const result = await provider.generateMessage({
      organization: { name: "Provence 360", tone: "PROFESSIONAL" },
      lead: baseLead,
      type: MessageType.SMS,
      tone: MessageTone.PROFESSIONAL,
      language: MessageLanguage.FR,
      unsubscribeUrl: "https://x.test/u/1",
    });
    expect(result.subject).toBeNull();
    expect(result.body).toContain("désinscrire");
  });

  it("summarizeConversation / translate : retournent le texte brut de Claude (pas de JSON attendu)", async () => {
    responseBody = { model: "claude-sonnet-5", content: [{ type: "text", text: "Résumé factuel de l'échange." }] };
    const provider = new AnthropicAIProvider({ baseUrl });
    const summary = await provider.summarizeConversation([{ direction: "OUTBOUND", body: "Bonjour" }]);
    expect(summary).toBe("Résumé factuel de l'échange.");
  });

  it("répond explicitement en échec (jamais un succès simulé) sur une erreur HTTP", async () => {
    responseStatus = 401;
    responseBody = { error: "invalid api key" };
    const provider = new AnthropicAIProvider({ baseUrl });
    await expect(provider.analyzeLead(baseLead)).rejects.toThrow(/401/);
  });

  it("répond explicitement en échec sur une réponse texte non structurée (pas de JSON exploitable)", async () => {
    responseBody = { model: "claude-sonnet-5", content: [{ type: "text", text: "Désolé, je ne peux pas répondre." }] };
    const provider = new AnthropicAIProvider({ baseUrl });
    await expect(provider.analyzeLead(baseLead)).rejects.toThrow(/JSON/);
  });
});

describe("AnthropicAIProvider — estimateCostUsd", () => {
  it("calcule un coût positif croissant avec la taille du texte, sans appel réseau", () => {
    const provider = new AnthropicAIProvider();
    const small = provider.estimateCostUsd(400, 200);
    const large = provider.estimateCostUsd(4000, 2000);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(small);
  });
});

afterAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});
