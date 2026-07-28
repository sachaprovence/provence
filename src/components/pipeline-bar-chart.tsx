"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const STAGE_LABEL: Record<string, string> = {
  NEW: "Nouveau",
  TO_ANALYZE: "À analyser",
  QUALIFIED: "Qualifié",
  MESSAGE_TO_VALIDATE: "Message à valider",
  CONTACTED: "Contacté",
  FOLLOW_UP_SCHEDULED: "Relance programmée",
  REPLIED: "Réponse reçue",
  INTERESTED: "Intéressé",
  APPOINTMENT_SCHEDULED: "RDV prévu",
  QUOTE_SENT: "Devis envoyé",
  NEGOTIATION: "Négociation",
  WON: "Client gagné",
  LOST: "Client perdu",
  TO_RECONTACT_LATER: "À recontacter",
  UNSUBSCRIBED: "Désinscrit",
};

export function PipelineBarChart({ data }: { data: { stage: string; count: number }[] }) {
  const chartData = data.map((d) => ({ name: STAGE_LABEL[d.stage] ?? d.stage, count: d.count }));

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: 560, height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 24, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid horizontal={false} stroke="#e1e0d9" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#898781" }} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: "#52514e" }} />
            <Tooltip
              cursor={{ fill: "#eae5f5" }}
              contentStyle={{ borderRadius: 8, borderColor: "#e1e0d9", fontSize: 12 }}
            />
            <Bar dataKey="count" fill="#2a78d6" radius={[0, 4, 4, 0]} maxBarSize={18} name="Prospects" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
