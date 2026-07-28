import { requireRole } from "@/lib/auth";
import { MembershipRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { TasksClient } from "@/components/tasks-client";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const actor = await requireRole([MembershipRole.OWNER_ADMIN, MembershipRole.SALES]);
  const sp = await searchParams;

  const tasks = await prisma.task.findMany({
    where: {
      organizationId: actor.organization.id,
      ...(sp.mine === "true" ? { assigneeId: actor.user.id } : {}),
    },
    include: { lead: true, assignee: true },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-p360-ink">Tâches</h1>
      <TasksClient tasks={tasks} />
    </div>
  );
}
