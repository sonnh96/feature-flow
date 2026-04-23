import { Link } from "@tanstack/react-router";
import { Search, Moon, Sun, GitBranch } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useGlobalSearch } from "./GlobalSearch";

export function AppHeader() {
  const { theme, toggle } = useTheme();
  const open = useGlobalSearch((s) => s.open);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-6 backdrop-blur">
      <Link to="/" className="flex items-center gap-2 font-semibold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground">
          <GitBranch className="h-4 w-4" />
        </span>
        <span className="text-sm tracking-tight">Featurebase</span>
      </Link>

      <button
        onClick={open}
        className="ml-4 hidden h-9 flex-1 max-w-xl items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted md:flex"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search features, tags, assignees…</span>
        <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>

      <div className="flex flex-1 justify-end items-center gap-2 md:flex-initial">
        <button
          onClick={open}
          className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          onClick={toggle}
          className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted"
          aria-label="Toggle theme"
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-[image:var(--gradient-primary)] text-xs font-semibold text-primary-foreground">
          YO
        </div>
      </div>
    </header>
  );
}
