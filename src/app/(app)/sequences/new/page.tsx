import { SequenceBuilder } from "@/components/sequence-builder";

export default function NewSequencePage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-p360-ink mb-6">Nouvelle séquence</h1>
      <SequenceBuilder />
    </div>
  );
}
