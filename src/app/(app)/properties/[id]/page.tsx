import { requireActor } from "@/lib/auth";
import { getProperty } from "@/lib/crm/property-service";
import { listAttachments } from "@/lib/crm/attachment-service";
import { PropertyDetailClient } from "@/components/property-detail-client";
import { AttachmentGallery } from "@/components/attachment-gallery";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const [property, attachments] = await Promise.all([
    getProperty(actor.organization.id, id),
    listAttachments(actor.organization.id, "Property", id),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <PropertyDetailClient
        property={{
          id: property.id,
          label: property.label,
          type: property.type,
          address: property.address,
          city: property.city,
          region: property.region,
          country: property.country,
          latitude: property.latitude,
          longitude: property.longitude,
          surfaceM2: property.surfaceM2,
          notes: property.notes,
        }}
        lead={{ id: property.lead.id, establishmentName: property.lead.establishmentName }}
        company={property.company ? { id: property.company.id, name: property.company.name } : null}
        virtualTours={property.virtualTours.map((vt) => ({ id: vt.id, status: vt.status, matterportUrl: vt.matterportUrl }))}
      />
      <AttachmentGallery
        entityType="Property"
        entityId={property.id}
        attachments={attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          url: a.url,
          category: a.category,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          createdAt: a.createdAt,
        }))}
      />
    </div>
  );
}
