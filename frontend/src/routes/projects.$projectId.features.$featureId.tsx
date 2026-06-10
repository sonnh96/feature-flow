import { useEffect } from "react";
import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useProject } from "@/lib/projects";
import { useStore } from "@/lib/store";
import { FeatureTree } from "@/components/FeatureTree";
import { FeatureDetail } from "@/components/FeatureDetail";

export const Route = createFileRoute("/projects/$projectId/features/$featureId")({
  head: () => ({ meta: [{ title: "Feature — Featurebase" }] }),
  beforeLoad: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) throw redirect({ to: "/auth" });
  },
  component: FeaturePage,
});

function FeaturePage() {
  const { projectId, featureId } = Route.useParams();
  const { project, loading } = useProject(projectId);
  const loadProjectFeatures = useStore((s) => s.loadProjectFeatures);
  const loadFeatureDetail = useStore((s) => s.loadFeatureDetail);
  const navigate = useNavigate();

  useEffect(() => {
    loadProjectFeatures(projectId);
  }, [projectId, loadProjectFeatures]);

  useEffect(() => {
    loadFeatureDetail(featureId);
  }, [featureId, loadFeatureDetail]);

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

  const onSelect = (id: string) =>
    navigate({
      to: "/projects/$projectId/features/$featureId",
      params: { projectId, featureId: id },
    });

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
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="mt-1.5 block truncate text-sm font-semibold transition-colors hover:text-primary"
          >
            {project.name}
          </Link>
        </div>
        <div className="h-[calc(100%-61px)]">
          <FeatureTree projectId={projectId} selectedId={featureId} onSelect={onSelect} />
        </div>
      </aside>

      <section className="flex-1 overflow-hidden">
        <FeatureDetail featureId={featureId} onSelect={onSelect} />
      </section>
    </div>
  );
}
