import { requireActorApi, isActorResponse, requireSalesFeatureApi } from "@/lib/api-helpers";
import { CSV_TEMPLATE_EXAMPLE, CSV_TEMPLATE_HEADERS } from "@/lib/csv-import";

export async function GET() {
  const actor = await requireActorApi();
  if (isActorResponse(actor)) return actor;
  const forbiddenResp = requireSalesFeatureApi(actor);
  if (forbiddenResp) return forbiddenResp;

  const csv = [CSV_TEMPLATE_HEADERS.join(","), CSV_TEMPLATE_EXAMPLE.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modele-import-prospects.csv"',
    },
  });
}
