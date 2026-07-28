import { requireActorApi, isActorResponse } from "@/lib/api-helpers";
import { CSV_TEMPLATE_EXAMPLE, CSV_TEMPLATE_HEADERS } from "@/lib/csv-import";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;

  const csv = [CSV_TEMPLATE_HEADERS.join(","), CSV_TEMPLATE_EXAMPLE.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modele-import-prospects.csv"',
    },
  });
}
