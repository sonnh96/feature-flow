import { Link } from "@tanstack/react-router";
import { Search, Moon, Sun, GitBranch, LogOut } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { useGlobalSearch } from "./GlobalSearch";

export function AppHeader() {
  const { theme, toggle } = useTheme();
  const { user, signOut, isAdmin } = useAuth();

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-6 backdrop-blur-md">
      <Link to="/" className="flex shrink-0 items-center gap-2.5 font-semibold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)]">
          <GitBranch className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">Featurebase</span>
      </Link>

      {user && (
        <button
          onClick={() => useGlobalSearch.getState().open()}
          className="ml-2 hidden h-8 flex-1 max-w-sm cursor-pointer items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 text-sm text-muted-foreground transition-all hover:border-border/80 hover:bg-muted md:flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left text-[13px]">Search features…</span>
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
        </button>
      )}

      <div className="flex flex-1 items-center justify-end gap-1 md:flex-initial">
        {user && (
          <button
            onClick={() => useGlobalSearch.getState().open()}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-[0.93] md:hidden"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={toggle}
          className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-[0.93]"
          aria-label="Toggle theme"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
        {user ? (
          <div className="ml-1 flex items-center gap-2">
            {isAdmin && (
              <span className="rounded border border-primary/20 bg-primary/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Admin
              </span>
            )}
            <div
              title={user.email ?? ""}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[image:var(--gradient-primary)] text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-soft)]"
            >
              {initials}
            </div>
            <button
              onClick={() => signOut()}
              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-all hover:bg-muted hover:text-foreground active:scale-[0.93]"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Link
            to="/auth"
            className="ml-2 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] transition-all hover:opacity-90 active:scale-[0.97]"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
