import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { ChevronLeft, FolderUp, Loader2, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { useProject } from "@/lib/projects";
import { FeatureTree } from "@/components/FeatureTree";
import { StatusDonut } from "@/components/StatusDonut";
import { StatusBadge } from "@/components/StatusBadge";
import { FeatureFormModal } from "@/components/FeatureFormModal";
import { FeatureImportModal } from "@/components/FeatureImportModal";
import type { FeatureFormData } from "@/components/FeatureFormModal";
import type { Status } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$projectId/")({
  head: () => ({ meta: [{ title: "Project — Featurebase" }] }),
  component: ProjectOverview,
});

function ProjectOverview() {
  const { projectId } = Route.useParams();
  const { project, loading } = useProject(projectId);
  const allFeatures = useStore((s) => s.features);
  const features = allFeatures.filter((f) => f.projectId === projectId);
  const loadProjectFeatures = useStore((s) => s.loadProjectFeatures);
  const createFeature = useStore((s) => s.createFeature);
  const upsertApiFeatures = useStore((s) => s.upsertApiFeatures);
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Load this project's features from the backend.
  useEffect(() => {
    loadProjectFeatures(projectId);
  }, [projectId, loadProjectFeatures]);

  if (loading) {
    return (
      <div className="grid h-[calc(100dvh-3.5rem)] place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Project not found.{" "}
        <Link to="/" className="text-primary underline">
          Go back
        </Link>
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

  const recent = [...features].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)]">
      <aside className="w-[300px] shrink-0 border-r border-sidebar-border bg-sidebar">
        <div className="border-b border-sidebar-border px-4 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> All projects
          </Link>
          <h2 className="mt-1.5 truncate text-sm font-semibold">{project.name}</h2>
        </div>
        <div className="h-[calc(100%-61px)]">
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
        <div className="mx-auto max-w-3xl px-8 py-10">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setImportOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground active:scale-[0.97]"
              >
                <FolderUp className="h-3.5 w-3.5" /> Import
              </button>
              <button
                onClick={() => setCreateOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97]"
              >
                <Plus className="h-3.5 w-3.5" /> New feature
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {project.description || <span className="italic opacity-50">No description</span>}
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat label="Total features" value={features.length} accent="primary" />
            <Stat label="In progress" value={counts.in_progress} accent="amber" />
            <Stat label="Done" value={counts.done} accent="green" />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-xl bg-card p-6 shadow-[var(--shadow-soft)]">
              <h3 className="mb-4 text-sm font-semibold">Status distribution</h3>
              <StatusDonut data={counts} />
            </div>
            <div className="rounded-xl bg-card p-6 shadow-[var(--shadow-soft)]">
              <h3 className="mb-3 text-sm font-semibold">Recently updated</h3>
              <ul className="divide-y divide-border">
                {recent.map((f) => (
                  <li key={f.id}>
                    <Link
                      to="/projects/$projectId/features/$featureId"
                      params={{ projectId, featureId: f.id }}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
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
                  <li className="py-6 text-center text-sm text-muted-foreground">
                    No features yet.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {createOpen && project && (
        <FeatureFormModal
          mode="create"
          projectId={project.id}
          onClose={() => setCreateOpen(false)}
          onSave={async (data: FeatureFormData) => {
            const f = await createFeature({
              projectId: project.id,
              parentId: null,
              name: data.name,
              featureType: data.featureType,
              status: data.status,
              priority: data.priority,
              assignee: data.assignee,
              targetDate: data.targetDate,
              tags: data.tags,
              description: data.description,
              links: data.links,
              attachments: data.attachments,
            });
            toast.success("Feature created");
            navigate({
              to: "/projects/$projectId/features/$featureId",
              params: { projectId: project.id, featureId: f.id },
            });
          }}
        />
      )}
      {project && (
        <FeatureImportModal
          projectId={project.id}
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={(result) => {
            upsertApiFeatures(result.created);
            toast.success(
              result.skipped_count
                ? `Imported ${result.created_count} features, skipped ${result.skipped_count}`
                : `Imported ${result.created_count} features`,
            );
          }}
        />
      )}
    </div>
  );
}

const STAT_ACCENT: Record<string, string> = {
  primary: "border-l-primary/50",
  amber: "border-l-status-progress/50",
  green: "border-l-status-done/50",
};

function Stat({
  label,
  value,
  accent = "primary",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-card p-5 shadow-[var(--shadow-soft)] border-l-2 ${STAT_ACCENT[accent] ?? STAT_ACCENT.primary}`}
    >
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-3xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
