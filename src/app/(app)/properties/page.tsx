import { requireActor } from "@/lib/auth";
import { listProperties } from "@/lib/crm/property-service";
import { PropertiesClient } from "@/components/properties-client";

/** Interface Biens (v1.1, AR-0161) — le service/l'API existent depuis v0.9 mais n'avaient aucune page. */
export default async function PropertiesPage() {
  const actor = await requireActor();
  const properties = await listProperties(actor.organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-p360-ink">Biens</h1>
        <p className="text-sm text-p360-muted mt-1">
          Biens immobiliers distincts du prospect/client qui les représente commercialement.
        </p>
      </div>
      <PropertiesClient
        properties={properties.map((p) => ({
          id: p.id,
          label: p.label,
          type: p.type,
          city: p.city,
          surfaceM2: p.surfaceM2,
          lead: p.lead,
          virtualTourCount: p._count.virtualTours,
        }))}
      />
    </div>
  );
}
