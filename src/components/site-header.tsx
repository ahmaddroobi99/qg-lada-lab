import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/simulate", label: "Lab" },
  { to: "/", label: "Archive" },
  { to: "/methods", label: "Methods" },
  { to: "/results", label: "Results" },
  { to: "/thesis", label: "Thesis" },
] as const;

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:h-16 md:px-6">
        <Link to="/" className="flex min-w-0 items-baseline gap-2">
          <span className="font-display text-lg text-fg md:text-xl">QG LaDA</span>
          <span className="hidden truncate text-xs text-subtle sm:inline">
            Droobi · Calgary 2025
          </span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Primary">
          {LINKS.map((link) => {
            const active = pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "rounded-sm px-2.5 py-2 text-sm transition-colors duration-150",
                  active ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
