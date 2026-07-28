import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { mapRow, parseCsv, suggestColumnMapping } from "@/lib/csv-import";
import { csvColumnMap, type LeadCsvField } from "@/lib/validations/lead";
import { writeAuditLog } from "@/lib/audit";
import { isSuppressed } from "@/lib/suppression";
import { LeadSourceType } from "@/generated/prisma/enums";

const previewSchema = z.object({ mode: z.literal("preview"), csv: z.string().min(1) });
const commitSchema = z.object({
  mode: z.literal("commit"),
  csv: z.string().min(1),
  mapping: z.record(z.string(), z.string()),
  fileName: z.string().optional(),
});

export async function POST(request: Request) {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;

  const body = await request.json().catch(() => null);

  if (body?.mode === "preview") {
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "CSV invalide." }, { status: 400 });
    const { headers, rows, errors } = parseCsv(parsed.data.csv);
    const mapping = suggestColumnMapping(headers);
    const preview = rows.slice(0, 10).map((r) => mapRow(r, mapping));
    return NextResponse.json({
      headers,
      knownFields: Object.keys(csvColumnMap),
      suggestedMapping: mapping,
      totalRows: rows.length,
      preview,
      parseErrors: errors,
    });
  }

  if (body?.mode === "commit") {
    const parsed = commitSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Données d'import invalides." }, { status: 400 });
    const { csv, mapping, fileName } = parsed.data;
    const { rows } = parseCsv(csv);

    const source = await prisma.leadSource.create({
      data: {
        organizationId: actor.organization.id,
        type: LeadSourceType.CSV_IMPORT,
        label: fileName ? `Import ${fileName}` : "Import CSV",
        fileName,
        importedById: actor.user.id,
      },
    });

    let created = 0;
    let skippedDuplicates = 0;
    let skippedSuppressed = 0;
    const rowErrorsReport: { row: number; errors: string[] }[] = [];

    const existingKeys = new Set(
      (
        await prisma.lead.findMany({
          where: { organizationId: actor.organization.id },
          select: { publicListingUrl: true, contacts: { select: { email: true } } },
        })
      ).flatMap((l) => [l.publicListingUrl, ...l.contacts.map((c) => c.email)].filter(Boolean) as string[])
    );

    for (let i = 0; i < rows.length; i++) {
      const mapped = mapRow(rows[i], mapping as Partial<Record<LeadCsvField, string>>);
      if (mapped.rowErrors.length > 0) {
        rowErrorsReport.push({ row: i + 2, errors: mapped.rowErrors });
        continue;
      }

      const dedupeKey = mapped.publicListingUrl || mapped.contactEmail;
      if (dedupeKey && existingKeys.has(dedupeKey)) {
        skippedDuplicates += 1;
        continue;
      }

      const suppressed = mapped.contactEmail ? await isSuppressed(actor.organization.id, mapped.contactEmail) : false;
      if (suppressed) skippedSuppressed += 1;

      await prisma.lead.create({
        data: {
          organizationId: actor.organization.id,
          sourceId: source.id,
          establishmentName: mapped.establishmentName,
          category: (mapped.category as never) ?? "OTHER",
          websiteUrl: mapped.websiteUrl || undefined,
          publicListingUrl: mapped.publicListingUrl || undefined,
          address: mapped.address || undefined,
          city: mapped.city || undefined,
          region: mapped.region || undefined,
          country: mapped.country || "France",
          reviewCount: mapped.reviewCount,
          averageRating: mapped.averageRating,
          isSuppressed: suppressed,
          suppressedAt: suppressed ? new Date() : undefined,
          contacts:
            mapped.contactName || mapped.contactEmail || mapped.contactPhone
              ? {
                  create: [
                    {
                      fullName: mapped.contactName,
                      email: mapped.contactEmail,
                      phone: mapped.contactPhone,
                      jobTitle: mapped.contactJobTitle,
                    },
                  ],
                }
              : undefined,
        },
      });

      if (dedupeKey) existingKeys.add(dedupeKey);
      created += 1;
    }

    await writeAuditLog({
      organizationId: actor.organization.id,
      userId: actor.user.id,
      action: "leads.imported",
      entityType: "LeadSource",
      entityId: source.id,
      metadata: { created, skippedDuplicates, skippedSuppressed, errors: rowErrorsReport.length },
    });

    return NextResponse.json({
      created,
      skippedDuplicates,
      skippedSuppressed,
      rowErrors: rowErrorsReport,
      totalRows: rows.length,
    });
  }

  return NextResponse.json({ error: "Mode inconnu." }, { status: 400 });
}
