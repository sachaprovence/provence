"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, ApiError } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast-provider";

export type WorkspaceOption = { id: string; name: string; role: string };

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  canManageWorkspaces,
}: {
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string;
  canManageWorkspaces: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(activeWorkspaceId);

  async function handleChange(workspaceId: string) {
    setValue(workspaceId);
    try {
      await apiPost("/api/workspaces/active", { workspaceId });
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setValue(activeWorkspaceId);
      push({
        title: "Changement de workspace impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-1">
      <label className="label" htmlFor="workspace-switcher">
        Workspace
      </label>
      <select
        id="workspace-switcher"
        className="input text-sm"
        value={value}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {canManageWorkspaces && (
        <Link href="/settings/workspaces" className="block text-xs text-p360-blue hover:underline">
          Gérer les workspaces
        </Link>
      )}
    </div>
  );
}
