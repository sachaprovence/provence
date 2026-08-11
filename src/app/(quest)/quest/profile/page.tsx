import { requireActor } from "@/lib/auth";
import { listMemories } from "@/lib/quest/memory-service";
import { MemoryList } from "@/components/quest/memory-list";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/logout-button";

export default async function QuestProfilePage() {
  const actor = await requireActor();
  const memories = await listMemories(actor.user.id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Profil</h1>
        <p className="text-sm text-quest-muted">
          {actor.user.firstName} {actor.user.lastName}
        </p>
      </header>

      <div className="space-y-2">
        <p className="text-sm font-medium text-quest-muted">Ce que l&apos;IA sait sur toi</p>
        <MemoryList
          memories={memories.map((m) => ({ id: m.id, content: m.content, confidence: m.confidence, confirmedByUser: m.confirmedByUser, type: m.type }))}
        />
      </div>

      <div className="quest-card p-2">
        <ThemeToggle />
      </div>

      <LogoutButton />
    </div>
  );
}
