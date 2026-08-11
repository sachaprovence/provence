"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";

type Milestone = { id: string; title: string; description: string | null };
type Quest = { id: string; title: string; estimatedMinutes: number };

type ReadyResult = { status: "READY"; goal: { id: string; title: string }; milestones: Milestone[]; quests: Quest[] };
type NeedsAnswersResult = { status: "NEEDS_ANSWERS"; goal: { id: string; title: string }; clarifyingQuestions: string[] };

type Step = "TITLE" | "QUESTIONS" | "SUMMARY";

/** Onboarding objectif (§3-4/§48 du brief) — arrive à la première quête le plus vite possible. */
export function CreateGoalFlow() {
  const router = useRouter();
  const { push } = useToast();
  const [step, setStep] = useState<Step>("TITLE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalId, setGoalId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReadyResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitTitle() {
    if (title.trim().length < 3) {
      push({ title: "Décris ton objectif en quelques mots.", variant: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/quest/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description: description || undefined }),
      });
      const data: ReadyResult | NeedsAnswersResult = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Erreur");
      setGoalId(data.goal.id);
      if (data.status === "NEEDS_ANSWERS") {
        setQuestions(data.clarifyingQuestions);
        setStep("QUESTIONS");
      } else {
        setResult(data);
        setStep("SUMMARY");
      }
    } catch (error) {
      push({ title: "Une erreur est survenue", description: error instanceof Error ? error.message : undefined, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAnswers() {
    if (!goalId) return;
    const payload = questions.map((q) => ({ question: q, answer: answers[q]?.trim() || "Pas de réponse précise." }));
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quest/goals/${goalId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });
      const data: ReadyResult = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Erreur");
      setResult(data);
      setStep("SUMMARY");
    } catch (error) {
      push({ title: "Une erreur est survenue", description: error instanceof Error ? error.message : undefined, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "TITLE") {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Quel objectif veux-tu atteindre ?</h1>
          <p className="text-sm text-quest-muted mt-1">Sois concret : &quot;créer mon entreprise&quot;, &quot;perdre 10 kg&quot;, &quot;apprendre l&apos;anglais&quot;…</p>
        </div>
        <textarea
          className="quest-input"
          rows={3}
          placeholder="Mon objectif…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
        <textarea
          className="quest-input"
          rows={2}
          placeholder="Détails utiles (optionnel)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button className="quest-btn-primary w-full" disabled={submitting} onClick={submitTitle}>
          {submitting ? "…" : "Créer mon parcours"}
        </button>
      </div>
    );
  }

  if (step === "QUESTIONS") {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Quelques précisions</h1>
          <p className="text-sm text-quest-muted mt-1">{questions.length} question{questions.length > 1 ? "s" : ""}, pour un plan vraiment adapté à toi.</p>
        </div>
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q}>
              <label className="block text-sm font-medium mb-1">{q}</label>
              <textarea
                className="quest-input"
                rows={2}
                value={answers[q] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <button className="quest-btn-primary w-full" disabled={submitting} onClick={submitAnswers}>
          {submitting ? "…" : "Continuer"}
        </button>
      </div>
    );
  }

  if (step === "SUMMARY" && result) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Ton parcours est prêt</h1>
          <p className="text-sm text-quest-muted mt-1">{result.goal.title}</p>
        </div>
        <div className="quest-card p-4 space-y-2">
          <p className="text-sm font-medium">Grandes étapes</p>
          <ol className="space-y-1 text-sm text-quest-muted list-decimal list-inside">
            {result.milestones.map((m) => (
              <li key={m.id}>{m.title}</li>
            ))}
          </ol>
        </div>
        <div className="quest-card p-4 space-y-2">
          <p className="text-sm font-medium">Tes prochaines quêtes</p>
          <ul className="space-y-1 text-sm text-quest-muted">
            {result.quests.map((q) => (
              <li key={q.id}>
                {q.title} <span className="text-quest-muted">({q.estimatedMinutes} min)</span>
              </li>
            ))}
          </ul>
        </div>
        <button className="quest-btn-primary w-full" onClick={() => router.push("/quest")}>
          Voir ma prochaine quête
        </button>
      </div>
    );
  }

  return null;
}
