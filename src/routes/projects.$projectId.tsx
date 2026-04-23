import { useEffect } from "react";
import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useProject } from "@/lib/projects";
import { FeatureTree } from "@/components/FeatureTree";
import { StatusDonut } from "@/components/StatusDonut";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import type { Status } from "@/lib/types";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({ meta: [{ title: "Project — Featurebase" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: ProjectOverview,
});

function ProjectOverview() {
  const { projectId } = Route.useParams();
  const { project, loading } = useProject(projectId);
  const features = useStore((s) => s.getProjectFeatures(projectId));
  const ensureSeeded = useStore((s) => s.ensureSeeded);
  const navigate = useNavigate();

  // Seed sample features only on first visit to a brand-new empty project
  useEffect(() => {
    if (project) ensureSeeded(project.id, true);
  }, [project, ensureSeeded]);

  if (loading) {
    return (
      <div className="grid h-[calc(100vh-3.5rem)] place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Project not found. <Link to="/" className="text-primary underline">Go back</Link>
      </div>
    );
  }

  const counts: Record<Status, number> = {
    todo: 0,
    in_progress: 0,
    done: 0,
    deprecated: 0,
  };
  features.forEach((f) => (counts[f.status] += 1));

  const recent = [...features]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <aside className="w-[320px] shrink-0 border-r border-sidebar-border bg-sidebar">
        <div className="border-b border-sidebar-border px-4 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> All projects
          </Link>
          <h2 className="mt-1.5 truncate text-sm font-semibold">{project.name}</h2>
        </div>
        <div className="h-[calc(100%-65px)]">
          <FeatureTree
            projectId={projectId}
            selectedId={null}
            onSelect={(id) =>
              navigate({
                to: "/projects/$projectId/features/$featureId",
                params: { projectId, featureId: id },
              })
            }
          />
        </div>
      </aside>

      <section className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-8">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.description || <span className="italic opacity-60">No description</span>}
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Stat label="Total features" value={features.length} />
            <Stat label="In progress" value={counts.in_progress} />
            <Stat label="Done" value={counts.done} />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 text-sm font-semibold">Status distribution</h3>
              <StatusDonut data={counts} />
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-3 text-sm font-semibold">Recently updated</h3>
              <ul className="divide-y divide-border">
                {recent.map((f) => (
                  <li key={f.id}>
                    <Link
                      to="/projects/$projectId/features/$featureId"
                      params={{ projectId, featureId: f.id }}
                      className="flex items-center gap-3 py-2.5 hover:bg-muted/40 -mx-2 px-2 rounded-md"
                    >
                      <StatusBadge status={f.status} />
                      <span className="flex-1 truncate text-sm">{f.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(f.updatedAt), "MMM d")}
                      </span>
                    </Link>
                  </li>
                ))}
                {recent.length === 0 && (
                  <li className="py-4 text-center text-sm text-muted-foreground">
                    No features yet.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
