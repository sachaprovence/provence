import type { MembershipRole } from "@/generated/prisma/enums";

export type NavItem = { href: string; label: string; roles?: MembershipRole[] };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/dashboards", label: "Autres tableaux de bord", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/leads", label: "Prospects", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/commercial", label: "Agent Commercial", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/workflows", label: "Workflows", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/automations", label: "Automatisations", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/pipeline", label: "Pipeline", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/campaigns", label: "Campagnes", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/sequences", label: "Séquences", roles: ["OWNER_ADMIN"] },
  { href: "/inbox", label: "Boîte de réception", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/tasks", label: "Tâches", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/appointments", label: "Rendez-vous", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/quotes", label: "Devis", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/invoices", label: "Factures", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/missions", label: "Missions" },
  { href: "/visits", label: "Visites 3D" },
  { href: "/map", label: "Carte", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/stats", label: "Statistiques", roles: ["OWNER_ADMIN", "SALES"] },
  { href: "/settings", label: "Paramètres", roles: ["OWNER_ADMIN"] },
  { href: "/settings/workspaces", label: "Workspaces", roles: ["OWNER_ADMIN"] },
  { href: "/settings/agents", label: "Agents IA", roles: ["OWNER_ADMIN"] },
  { href: "/settings/director", label: "Agent Director", roles: ["OWNER_ADMIN"] },
  { href: "/settings/knowledge", label: "Intelligence documentaire", roles: ["OWNER_ADMIN"] },
  { href: "/settings/metrics", label: "Métriques", roles: ["OWNER_ADMIN"] },
  { href: "/settings/api-keys", label: "Clés API", roles: ["OWNER_ADMIN"] },
  { href: "/settings/webhooks", label: "Webhooks sortants", roles: ["OWNER_ADMIN"] },
  { href: "/settings/billing", label: "Facturation", roles: ["OWNER_ADMIN"] },
  { href: "/users", label: "Utilisateurs", roles: ["OWNER_ADMIN"] },
];
