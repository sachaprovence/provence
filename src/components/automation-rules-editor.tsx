"use client";

import { useState } from "react";
import { apiPatch } from "@/lib/api-client";

type Rule = { id: string; name: string; isActive: boolean };

export function AutomationRulesEditor({ initialRules }: { initialRules: Rule[] }) {
  const [rules, setRules] = useState(initialRules);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(rule: Rule) {
    setBusy(rule.id);
    try {
      await apiPatch(`/api/settings/automation-rules/${rule.id}`, { isActive: !rule.isActive });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="divide-y divide-p360-lavender-light">
      {rules.map((rule) => (
        <li key={rule.id} className="flex items-center justify-between py-2 text-sm">
          <span className="text-p360-ink">{rule.name}</span>
          <input type="checkbox" checked={rule.isActive} disabled={busy === rule.id} onChange={() => toggle(rule)} />
        </li>
      ))}
    </ul>
  );
}
