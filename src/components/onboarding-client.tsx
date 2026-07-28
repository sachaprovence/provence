"use client";

import { useRouter } from "next/navigation";
import { OrganizationForm, type OrganizationFormData } from "@/components/organization-form";

export function OnboardingClient({ initial }: { initial: Partial<OrganizationFormData> & { name: string } }) {
  const router = useRouter();
  return (
    <OrganizationForm
      initial={initial}
      submitLabel="Terminer et accéder au tableau de bord"
      onSaved={() => {
        setTimeout(() => router.push("/dashboard"), 600);
      }}
    />
  );
}
