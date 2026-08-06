import { notFound } from "next/navigation";
import { requireWorkspaceActor } from "@/lib/workspace-context";
import {
  resolveCustomAgentOrThrow,
  listConversations,
  createConversation,
} from "@/lib/agents/custom/custom-agent-service";
import { NotFoundError } from "@/lib/errors";
import { CustomAgentChatClient } from "@/components/custom-agent-chat-client";

export default async function CustomAgentChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireWorkspaceActor();

  let agent;
  try {
    agent = await resolveCustomAgentOrThrow(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  let conversations = await listConversations(actor, id);
  if (conversations.length === 0) {
    const created = await createConversation(actor, id);
    conversations = [created];
  }

  return (
    <div className="max-w-6xl">
      <CustomAgentChatClient
        agent={{
          id: agent.id,
          name: agent.name,
          description: agent.description,
          toolKeys: agent.toolKeys,
          memoryEnabled: agent.memoryEnabled,
        }}
        initialConversations={conversations.map((c) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
