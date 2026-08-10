"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { NAV_ITEMS } from "@/components/nav-config";
import type { MembershipRole } from "@/generated/prisma/enums";

export function SidebarNav({ role, navigationOverrides = {} }: { role: MembershipRole; navigationOverrides?: Record<string, boolean> }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => (!item.roles || item.roles.includes(role)) && navigationOverrides[item.href] !== false);

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              active ? "bg-p360-blue text-white" : "text-p360-ink hover:bg-p360-lavender-light"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
