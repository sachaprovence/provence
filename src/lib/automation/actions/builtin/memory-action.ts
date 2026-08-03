import "server-only";
import { ValidationError } from "@/lib/errors";
import { setMemoryEntry } from "@/lib/memory/memory-engine";
import type { MemoryScopeType, MemoryKind } from "@/generated/prisma/enums";
import type { AutomationJobHandler } from "../registry";

type MemorySetInput = {
  scopeType: MemoryScopeType;
  scopeId: string;
  kind: MemoryKind;
  key: string;
  value: unknown;
  ttlMs?: number;
};

/** Point d'intégration avec le Memory Engine (v0.7, non modifié) : réutilise directement `setMemoryEntry`. */
export const memorySetAction: AutomationJobHandler<MemorySetInput, { id: string; version: number }> = {
  key: "memory.set",
  name: "Créer une mémoire",
  description: "Écrit une entrée dans le Memory Engine (v0.7) — versionnée, jamais modifiée en place.",
  category: "connaissance",
  async execute(input, context) {
    if (!input.scopeType || !input.scopeId || !input.kind || !input.key?.trim()) {
      throw new ValidationError('Le job "memory.set" nécessite "scopeType", "scopeId", "kind" et "key".');
    }
    const entry = await setMemoryEntry({
      organizationId: context.organizationId,
      workspaceId: context.workspaceId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      kind: input.kind,
      key: input.key,
      value: input.value,
      ttlMs: input.ttlMs,
    });
    await context.log("info", `Mémoire "${entry.key}" écrite (version ${entry.version}).`);
    return { id: entry.id, version: entry.version };
  },
};
