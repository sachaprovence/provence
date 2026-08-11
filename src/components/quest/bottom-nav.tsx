"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Target, MessageCircle, TrendingUp, User } from "lucide-react";

const ITEMS = [
  { href: "/quest", label: "Aujourd'hui", icon: Home },
  { href: "/quest/goals", label: "Objectifs", icon: Target },
  { href: "/quest/assistant", label: "Assistant", icon: MessageCircle },
  { href: "/quest/progress", label: "Progression", icon: TrendingUp },
  { href: "/quest/profile", label: "Profil", icon: User },
] as const;

/** Navigation basse mobile-first (§46 du brief) — 5 destinations, jamais plus. */
export function QuestBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="quest-bottom-nav flex" aria-label="Navigation principale">
      {ITEMS.map((item) => {
        const active = item.href === "/quest" ? pathname === "/quest" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className="quest-bottom-nav-item" data-active={active}>
            <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
