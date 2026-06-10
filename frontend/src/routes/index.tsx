import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Plus,
  Search,
  Folder,
  Shield,
  CreditCard,
  Smartphone,
  Cpu,
  Rocket,
  Loader2,
} from "lucide-react";
import { useProjects } from "@/lib/projects";
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
  beforeLoad: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      throw redirect({ to: "/auth" });
    }
  },
  component: Dashboard,
});

function Dashboard() {
  const { projects, loading } = useProjects();
  const features = useStore((s) => s.features);
  const loadFeaturesForProjects = useStore((s) => s.loadFeaturesForProjects);
  const [filter, setFilter] = useState<"all" | "active" | "archived">("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // Load feature counts for every project so the dashboard cards are accurate.
  const projectIdsKey = projects.map((p) => p.id).join(",");
  useEffect(() => {
    if (projectIdsKey) loadFeaturesForProjects(projectIdsKey.split(","));
  }, [projectIdsKey, loadFeaturesForProjects]);

  const filtered = projects
    .filter((p) => (filter === "all" ? true : p.status === filter))
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Projects</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {projects.length} project{projects.length !== 1 ? "s" : ""} · {features.length} features
            documented
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] transition-all hover:opacity-90 active:scale-[0.97]"
        >
          <Plus className="h-4 w-4" /> New project
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-muted/70 p-1">
          {(["all", "active", "archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium capitalize transition-all ${
                filter === f
                  ? "bg-background text-foreground shadow-[var(--shadow-soft)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8.5 pr-3 text-sm outline-none transition-all focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-32 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-elevated)]">
            <Folder className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-base font-semibold">No projects yet</h3>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
            Create your first project to start organizing and documenting features.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] transition-all hover:opacity-90 active:scale-[0.97]"
          >
            <Plus className="h-4 w-4" /> Create first project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const Icon = ICON_MAP[p.icon] ?? Folder;
            const count = features.filter((f) => f.projectId === p.id).length;
            return (
              <Link
                key={p.id}
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                className="group relative flex flex-col rounded-2xl bg-card p-5 shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-elevated)] active:translate-y-0 active:shadow-[var(--shadow-soft)]"
              >
                <span className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-[image:var(--gradient-primary)] opacity-60 transition-opacity duration-200 group-hover:opacity-100" />

                <div className="flex items-start justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-soft)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                      p.status === "active"
                        ? "bg-status-done/10 text-status-done"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {labelProjectStatus(p.status)}
                  </span>
                </div>

                <div className="mt-4 flex-1">
                  <h3 className="font-semibold leading-snug">{p.name}</h3>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {p.description || <span className="italic opacity-50">No description</span>}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3.5 text-xs text-muted-foreground">
                  <span>
                    <span className="font-semibold tabular-nums text-foreground">{count}</span>{" "}
                    feature{count !== 1 ? "s" : ""}
                  </span>
                  <span>Updated {format(new Date(p.updatedAt), "MMM d")}</span>
                </div>
              </Link>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              No projects match your filters.
            </div>
          )}
        </div>
      )}

      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
    </div>
  );
}
