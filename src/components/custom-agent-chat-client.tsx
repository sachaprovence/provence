"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast-provider";

type ConversationSummary = { id: string; title: string; updatedAt: string };
type ChatMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "TOOL";
  content: string;
  toolKey: string | null;
  createdAt: string;
};

export function CustomAgentChatClient({
  agent,
  initialConversations,
}: {
  agent: { id: string; name: string; description: string | null; toolKeys: string[]; memoryEnabled: boolean };
  initialConversations: ConversationSummary[];
}) {
  const { push } = useToast();
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId) return;
    apiGet<{ messages: ChatMessage[] }>(`/api/custom-agent-conversations/${activeId}/messages`)
      .then((res) => setMessages(res.messages))
      .catch(() => push({ title: "Impossible de charger la conversation", variant: "error" }))
      .finally(() => setLoadedConversationId(activeId));
  }, [activeId, push]);

  const loadingMessages = activeId !== null && loadedConversationId !== activeId;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleNewConversation() {
    try {
      const res = await apiPost<{ conversation: ConversationSummary }>(`/api/custom-agents/${agent.id}/conversations`, {});
      setConversations((prev) => [res.conversation, ...prev]);
      setActiveId(res.conversation.id);
      setMessages([]);
    } catch {
      push({ title: "Impossible de créer une conversation", variant: "error" });
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !input.trim()) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `optimistic-${Date.now()}`, role: "USER", content, toolKey: null, createdAt: new Date().toISOString() },
    ]);
    try {
      await apiPost(`/api/custom-agent-conversations/${activeId}/messages`, { content });
      const res = await apiGet<{ messages: ChatMessage[] }>(`/api/custom-agent-conversations/${activeId}/messages`);
      setMessages(res.messages);
      setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, updatedAt: new Date().toISOString() } : c)));
    } catch (err) {
      push({
        title: "L'agent n'a pas pu répondre",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  }

  async function handleRunTool(toolKey: string) {
    if (!activeId) return;
    try {
      await apiPost(`/api/custom-agent-conversations/${activeId}/tool-runs`, { toolKey, input: {} });
      const res = await apiGet<{ messages: ChatMessage[] }>(`/api/custom-agent-conversations/${activeId}/messages`);
      setMessages(res.messages);
    } catch (err) {
      push({
        title: `Échec de l'outil "${toolKey}"`,
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
      <Card className="p-3">
        <Button variant="secondary" className="w-full" onClick={handleNewConversation}>
          + Nouvelle conversation
        </Button>
        <div className="mt-3 space-y-1">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`w-full truncate rounded px-2 py-1.5 text-left text-sm ${
                c.id === activeId ? "bg-p360-lavender-light text-p360-blue" : "text-p360-ink hover:bg-p360-sand-light"
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex h-[70vh] flex-col p-4">
        <div className="border-b border-p360-border pb-3">
          <h2 className="text-lg font-semibold text-p360-ink">{agent.name}</h2>
          {agent.description && <p className="text-sm text-p360-muted">{agent.description}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {agent.memoryEnabled && <Badge variant="success">Mémoire active</Badge>}
            {agent.toolKeys.map((key) => (
              <button key={key} onClick={() => handleRunTool(key)}>
                <Badge variant="info" className="cursor-pointer hover:opacity-80">
                  ▶ {key}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto py-4">
          {loadingMessages ? (
            <div className="flex justify-center">
              <Spinner />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-p360-muted">Aucun message. Écrivez à votre agent pour commencer.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "USER" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                    m.role === "USER"
                      ? "bg-p360-blue text-white"
                      : m.role === "TOOL"
                        ? "bg-p360-sand-light text-p360-ink italic"
                        : "bg-p360-lavender-light text-p360-ink"
                  }`}
                >
                  {m.toolKey && <p className="mb-1 text-xs font-semibold uppercase">Outil : {m.toolKey}</p>}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="flex gap-2 border-t border-p360-border pt-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            rows={2}
            placeholder="Écrivez votre message…"
            className="flex-1"
          />
          <Button type="submit" loading={sending} disabled={!activeId || !input.trim()}>
            Envoyer
          </Button>
        </form>
      </Card>
    </div>
  );
}
