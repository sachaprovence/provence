"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-provider";

export type WorkspaceRoleOption = {
  value: string;
  label: string;
};

export type WorkspaceMemberRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
};

export function WorkspaceMembersClient({
  workspaceId,
  members,
  roles,
  currentUserId,
}: {
  workspaceId: string;
  members: WorkspaceMemberRow[];
  roles: WorkspaceRoleOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[roles.length - 1]?.value ?? "");
  const [inviting, setInviting] = useState(false);
  const [demoInvitationLink, setDemoInvitationLink] = useState<string | null>(null);
  const [busyMembershipId, setBusyMembershipId] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setDemoInvitationLink(null);
    try {
      const res = await apiPost<{ demoInvitationLink?: string }>(`/api/workspaces/${workspaceId}/members`, {
        email,
        role,
      });
      setEmail("");
      if (res.demoInvitationLink) setDemoInvitationLink(res.demoInvitationLink);
      push({ title: "Invitation envoyée", variant: "success" });
      router.refresh();
    } catch (err) {
      push({
        title: "Invitation impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(membershipId: string, newRole: string) {
    setBusyMembershipId(membershipId);
    try {
      await apiPatch(`/api/workspaces/${workspaceId}/members/${membershipId}`, { role: newRole });
      router.refresh();
    } catch (err) {
      push({
        title: "Changement de rôle impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setBusyMembershipId(null);
    }
  }

  async function handleRemove(membershipId: string) {
    setBusyMembershipId(membershipId);
    try {
      await apiDelete(`/api/workspaces/${workspaceId}/members/${membershipId}`);
      router.refresh();
    } catch (err) {
      push({
        title: "Retrait impossible",
        description: err instanceof ApiError ? err.message : "Erreur inattendue.",
        variant: "error",
      });
    } finally {
      setBusyMembershipId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-p360-lavender-light/40 text-xs uppercase text-p360-muted">
            <tr>
              <th className="px-4 py-2 text-left">Nom</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Rôle</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.membershipId} className="border-t border-p360-lavender-light">
                <td className="px-4 py-2 text-p360-ink">{member.name}</td>
                <td className="px-4 py-2 text-p360-muted">{member.email}</td>
                <td className="px-4 py-2">
                  {member.userId === currentUserId ? (
                    <Badge variant="neutral">{roles.find((r) => r.value === member.role)?.label}</Badge>
                  ) : (
                    <select
                      className="input text-sm"
                      value={member.role}
                      disabled={busyMembershipId === member.membershipId}
                      onChange={(e) => handleRoleChange(member.membershipId, e.target.value)}
                    >
                      {roles.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-4 py-2">
                  {member.userId !== currentUserId && (
                    <Button
                      variant="danger"
                      loading={busyMembershipId === member.membershipId}
                      onClick={() => handleRemove(member.membershipId)}
                    >
                      Retirer
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inviter un membre</CardTitle>
        </CardHeader>
        <form onSubmit={handleInvite} className="flex items-end gap-3">
          <div className="flex-1">
            <Input type="email" label="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Select label="Rôle" value={role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" loading={inviting}>
            Inviter
          </Button>
        </form>
        {demoInvitationLink && (
          <p className="mt-3 text-sm text-p360-ink">
            Mode démo : aucun email n&apos;est envoyé.{" "}
            <Link href={demoInvitationLink} className="text-p360-blue hover:underline">
              Lien d&apos;invitation
            </Link>
            .
          </p>
        )}
      </Card>
    </div>
  );
}
