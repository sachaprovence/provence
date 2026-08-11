"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Message = { id: string; role: "USER" | "ASSISTANT"; content: string };

const SUGGESTIONS = ["J'ai 15 minutes", "Cette quête est trop compliquée", "Je n'ai aucune motivation aujourd'hui", "Pourquoi tu me proposes ça ?"];

export function AssistantChat({ initialMessages, initialConversationId }: { initialMessages: Message[]; initialConversationId?: string | null }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const localIdCounter = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    localIdCounter.current += 1;
    const userMessage: Message = { id: `local-${localIdCounter.current}`, role: "USER", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const res = await fetch("/api/quest/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setConversationId(data.conversation.id);
      setMessages((prev) => [...prev, { id: data.reply.id, role: "ASSISTANT", content: data.reply.content }]);
      router.refresh();
    } catch {
      setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: "ASSISTANT", content: "Je n'ai pas pu répondre, réessaie." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-11rem)]">
      <div className="flex-1 overflow-y-auto space-y-3 pb-3">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="quest-badge" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "USER" ? "ml-auto bg-quest-accent text-white" : "quest-card"}`}>
            {m.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input className="quest-input" placeholder="Écris à ton assistant…" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="quest-btn-primary" disabled={sending}>
          {sending ? "…" : "Envoyer"}
        </button>
      </form>
    </div>
  );
}
