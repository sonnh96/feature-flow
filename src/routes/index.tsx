import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { format } from "date-fns";
import { Plus, Search, Folder, Shield, CreditCard, Smartphone, Cpu, Rocket } from "lucide-react";
import { useStore, labelProjectStatus } from "@/lib/store";
import { CreateProjectModal } from "@/components/CreateProjectModal";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Folder,
  Shield,
  CreditCard,
  Smartphone,
  Cpu,
  Rocket,
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Projects — Featurebase" },
      {
        name: "description",
        content: "All your software projects and their feature documentation in one place.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const projects = useStore((s) => s.projects);
  const features = useStore((s) => s.features);
  const [filter, setFilter] = useState<"all" | "active" | "archived">("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = projects
    .filter((p) => (filter === "all" ? true : p.status === filter))
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length} projects · documenting {features.length} features
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-border bg-card p-0.5">
          {(["all", "active", "archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const Icon = ICON_MAP[p.icon] ?? Folder;
          const count = features.filter((f) => f.projectId === p.id).length;
          return (
            <Link
              key={p.id}
              to="/projects/$projectId"
              params={{ projectId: p.id }}
              className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-elevated)]"
            >
              <div className="flex items-start justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)]">
                  <Icon className="h-5 w-5" />
                </div>
                <span
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    p.status === "active"
                      ? "border-status-done/30 bg-status-done/10 text-status-done"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {labelProjectStatus(p.status)}
                </span>
              </div>
              <div>
                <h3 className="text-base font-semibold">{p.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  <span className="font-medium tabular-nums text-foreground">{count}</span> features
                </span>
                <span>Updated {format(new Date(p.updatedAt), "MMM d")}</span>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No projects match.
          </div>
        )}
      </div>

      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}
