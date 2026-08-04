import { NextResponse } from "next/server";
import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { toApiErrorResponse } from "@/lib/errors";
import { attachmentEntityTypeSchema, attachmentCategorySchema } from "@/lib/validations/crm";
import { createAttachment } from "@/lib/crm/attachment-service";
import { getStorageProvider } from "@/lib/storage";
import { writeAuditLog } from "@/lib/audit";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** Upload réel d'une pièce jointe (v1.1, AR-0162) — combine stockage (StorageProvider) + création de l'Attachment en un seul appel. */
export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier requis." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: "Fichier trop volumineux (20 Mo maximum)." }, { status: 400 });
    }

    const entityTypeParsed = attachmentEntityTypeSchema.safeParse(formData.get("entityType"));
    const categoryParsed = attachmentCategorySchema.safeParse(formData.get("category"));
    const entityId = formData.get("entityId");
    if (!entityTypeParsed.success || !categoryParsed.success || typeof entityId !== "string" || !entityId) {
      return NextResponse.json({ error: "Paramètres invalides (entityType/entityId/category)." }, { status: 400 });
    }

    const data = Buffer.from(await file.arrayBuffer());
    const provider = getStorageProvider();
    const { url } = await provider.upload({
      organizationId: actor.organization.id,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      data,
    });

    const attachment = await createAttachment(actor.organization.id, actor.user.id, {
      entityType: entityTypeParsed.data,
      entityId,
      category: categoryParsed.data,
      fileName: file.name,
      url,
      mimeType: file.type || undefined,
      sizeBytes: file.size,
    });

    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "attachment.uploaded",
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      metadata: { attachmentId: attachment.id, category: attachment.category, storageProvider: provider.name },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, { route: "POST /api/attachments/upload" });
  }
}
