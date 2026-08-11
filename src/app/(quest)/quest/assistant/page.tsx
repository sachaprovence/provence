import { requireActor } from "@/lib/auth";
import { listConversations, listConversationMessages } from "@/lib/quest/assistant-service";
import { AssistantChat } from "@/components/quest/assistant-chat";

export default async function QuestAssistantPage() {
  const actor = await requireActor();
  const conversations = await listConversations(actor.user.id);
  const latest = conversations[0];
  const messages = latest ? await listConversationMessages(actor.user.id, latest.id) : [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Assistant</h1>
      <AssistantChat
        initialMessages={messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
        initialConversationId={latest?.id ?? null}
      />
    </div>
  );
}
