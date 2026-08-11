import { requireActor } from "@/lib/auth";
import { QuestBottomNav } from "@/components/quest/bottom-nav";

/**
 * Coquille Personal Quest AI (ADR 0049) — mobile-first, navigation basse
 * dédiée (§46 du brief), distincte de la sidebar desktop du CRM
 * (`src/app/(app)/layout.tsx`). Réutilise uniquement l'authentification par
 * session (`requireActor`) et le thème/toasts déjà montés dans
 * `src/app/layout.tsx`.
 */
export default async function QuestLayout({ children }: { children: React.ReactNode }) {
  await requireActor();

  return (
    <div className="quest-shell">
      <div className="max-w-md mx-auto px-4 pt-6 pb-28">{children}</div>
      <QuestBottomNav />
    </div>
  );
}
