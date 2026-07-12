import Link from "next/link";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * App header wordmark + nav. `active` marks the current section. The right slot
 * is where the playground injects its client-only API-key settings button.
 */
export function SiteHeader({
  active,
  right,
}: {
  active: "playground" | "leaderboard";
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Activity className="size-5 text-accent" aria-hidden />
            <span className="font-mono text-sm font-semibold tracking-tight text-text">
              llm<span className="text-accent">·</span>eval
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/" label="Playground" active={active === "playground"} />
            <NavLink
              href="/leaderboard"
              label="Leaderboard"
              active={active === "leaderboard"}
            />
          </nav>
        </div>
        {right}
      </div>
    </header>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 transition-colors",
        active ? "bg-raised-2 text-text" : "text-muted hover:text-text",
      )}
    >
      {label}
    </Link>
  );
}
