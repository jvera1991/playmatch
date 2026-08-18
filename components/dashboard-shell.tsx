import Link from "next/link";
import { Navbar } from "@/components/navbar";

export function DashboardShell({
  title,
  links,
  activeHref,
  children,
}: {
  title: string;
  links: { href: string; label: string; icon: string }[];
  activeHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ink-50">
      <Navbar />
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-8">
        <aside className="hidden w-56 shrink-0 sm:block">
          <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            {title}
          </p>
          <nav className="space-y-1">
            {links.map((link) => {
              const active = activeHref === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-600 text-white shadow-soft"
                      : "text-ink-600 hover:bg-white hover:text-ink-900"
                  }`}
                >
                  <span>{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Selector móvil */}
        <div className="mb-2 flex gap-2 overflow-x-auto sm:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                activeHref === link.href
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-ink-200 text-ink-700"
              }`}
            >
              {link.icon} {link.label}
            </Link>
          ))}
        </div>

        <div className="min-w-0 flex-1 animate-fade-up">{children}</div>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
