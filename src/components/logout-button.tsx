"use client";

import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await apiPost("/api/auth/logout");
        router.push("/login");
        router.refresh();
      }}
      className="text-sm text-p360-muted hover:text-p360-danger"
    >
      Déconnexion
    </button>
  );
}
