"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function formatEuros(cents: number) {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export function ComptaSalesChart({ data }: { data: { date: string; total: number }[] }) {
  const chartData = data.map((d) => ({ name: formatDay(d.date), total: d.total / 100 }));

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: 480, height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="#e1e0d9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#898781" }} />
            <YAxis tick={{ fontSize: 11, fill: "#898781" }} width={48} />
            <Tooltip
              cursor={{ fill: "#eae5f5" }}
              contentStyle={{ borderRadius: 8, borderColor: "#e1e0d9", fontSize: 12 }}
              formatter={(value) => formatEuros(Number(value ?? 0) * 100)}
            />
            <Bar dataKey="total" fill="#2f7d52" radius={[4, 4, 0, 0]} maxBarSize={28} name="CA" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
