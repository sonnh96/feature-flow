import { create } from "zustand";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useStore, fromApiFeature } from "@/lib/store";
import { useProjects } from "@/lib/projects";
import { apiFetch } from "@/lib/api";
import { Search, X, ChevronRight } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { Feature } from "@/lib/types";

interface SearchState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

// Shared command-palette state lives here because the header and modal are coupled.
// eslint-disable-next-line react-refresh/only-export-components
export const useGlobalSearch = create<SearchState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

const RECENT_KEY = "fb_recent_searches";

export function GlobalSearch() {
  const { isOpen, close } = useGlobalSearch();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"current" | "all">("current");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const navigate = useNavigate();

  const { projects } = useProjects();
  const getBreadcrumb = useStore((s) => s.getBreadcrumb);
  const [results, setResults] = useState<Feature[]>([]);

  // try to read current project from URL
  let currentProjectId: string | undefined;
  try {
    const params = useParams({ strict: false }) as { projectId?: string };
    currentProjectId = params.projectId;
  } catch (error) {
    void error;
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch (error) {
      void error;
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useGlobalSearch.getState().open();
      }
      if (e.key === "Escape") useGlobalSearch.getState().close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (debounced.trim()) params.set("q", debounced.trim());
    if (scope === "current" && currentProjectId) params.set("project_id", currentProjectId);
    if (statusFilter) params.set("status", statusFilter);
    params.set("limit", "50");
    apiFetch(`/api/v1/search?${params.toString()}`)
      .then((data) => {
        if (!cancelled) setResults((data?.results ?? []).map(fromApiFeature));
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, debounced, scope, currentProjectId, statusFilter]);

  const grouped = useMemo(() => {
    return {
      top: results.filter((r) => !r.parentId && r.status !== "deprecated"),
      sub: results.filter((r) => r.parentId && r.status !== "deprecated"),
      deprecated: results.filter((r) => r.status === "deprecated"),
    };
  }, [results]);

  const saveRecent = (q: string) => {
    if (!q.trim()) return;
    const next = [q, ...recent.filter((r) => r !== q)].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (error) {
      void error;
    }
  };

  const goTo = (featureId: string) => {
    const f = results.find((x) => x.id === featureId);
    if (!f) return;
    saveRecent(query);
    close();
    navigate({
      to: "/projects/$projectId/features/$featureId",
      params: { projectId: f.projectId, featureId: f.id },
    });
  };

  if (!isOpen) return null;

  const highlight = (text: string) => {
    if (!debounced.trim()) return text;
    const idx = text.toLowerCase().indexOf(debounced.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-primary/20 text-foreground rounded px-0.5">
          {text.slice(idx, idx + debounced.length)}
        </mark>
        {text.slice(idx + debounced.length)}
      </>
    );
  };

  const renderRow = (f: Feature) => {
    const trail = getBreadcrumb(f.id);
    const project = projects.find((p) => p.id === f.projectId);
    return (
      <button
        key={f.id}
        onClick={() => goTo(f.id)}
        className="flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {highlight(f.featureCode)}
            </span>
            <span className="truncate font-medium">{highlight(f.name)}</span>
            <StatusBadge status={f.status} />
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <span>{project?.name}</span>
            {trail.slice(0, -1).map((t) => (
              <span key={t.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <span className="truncate">{t.name}</span>
              </span>
            ))}
          </div>
          {f.description && (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {highlight(f.description.slice(0, 140))}
            </p>
          )}
          {f.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {f.tags.map((t) => (
                <span
                  key={t}
                  className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/30 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-[var(--shadow-elevated)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features, tags, descriptions…"
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={close}
            className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
          <span className="text-muted-foreground">Scope:</span>
          <button
            onClick={() => setScope("current")}
            disabled={!currentProjectId}
            className={`cursor-pointer rounded px-2 py-1 ${scope === "current" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Current project
          </button>
          <button
            onClick={() => setScope("all")}
            className={`cursor-pointer rounded px-2 py-1 ${scope === "all" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            All projects
          </button>
          <span className="ml-3 text-muted-foreground">Status:</span>
          {(["todo", "in_progress", "done", "deprecated"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
              className={`cursor-pointer rounded px-2 py-1 capitalize ${statusFilter === s ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="scroll-thin flex-1 overflow-y-auto p-2">
          {!debounced && recent.length > 0 && (
            <div className="mb-2 px-2 pt-1">
              <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Recent</div>
              <div className="flex flex-wrap gap-1">
                {recent.map((r) => (
                  <button
                    key={r}
                    onClick={() => setQuery(r)}
                    className="cursor-pointer rounded-md border border-border bg-muted/50 px-2 py-1 text-xs hover:bg-muted"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              No results found.
            </div>
          ) : (
            <>
              {grouped.top.length > 0 && (
                <Group title="Top-level features" count={grouped.top.length}>
                  {grouped.top.map(renderRow)}
                </Group>
              )}
              {grouped.sub.length > 0 && (
                <Group title="Sub-features" count={grouped.sub.length}>
                  {grouped.sub.map(renderRow)}
                </Group>
              )}
              {grouped.deprecated.length > 0 && (
                <Group title="Deprecated" count={grouped.deprecated.length}>
                  {grouped.deprecated.map(renderRow)}
                </Group>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span>
            <kbd className="rounded border border-border bg-background px-1 font-mono">↵</kbd> open
            · <kbd className="rounded border border-border bg-background px-1 font-mono">esc</kbd>{" "}
            close
          </span>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between px-3 pb-1 pt-2 text-[11px] font-semibold text-muted-foreground">
        <span>{title}</span>
        <span>{count}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
