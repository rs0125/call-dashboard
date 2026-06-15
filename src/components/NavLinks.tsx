"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconKey = "home" | "phone";

const links: { href: string; label: string; icon: IconKey }[] = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/calls", label: "All calls", icon: "phone" },
];

function NavIcon({ icon }: { icon: IconKey }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (icon === "home")
    return (
      <svg {...common}>
        <path d="M3 12L12 4l9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    );
  // phone
  return (
    <svg {...common}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {links.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link ${active ? "active" : ""}`}
          >
            <NavIcon icon={l.icon} />
            <span>{l.label}</span>
          </Link>
        );
      })}
    </>
  );
}
