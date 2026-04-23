import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useStore } from "@/lib/store";
import { FeatureTree } from "@/components/FeatureTree";
import { FeatureDetail } from "@/components/FeatureDetail";

export const Route = createFileRoute("/projects/$projectId/features/$featureId")({
  head: () => ({ meta: [{ title: "Feature — Featurebase" }] }),
  component: FeaturePage,
});

function FeaturePage() {
  const { projectId, featureId } = Route.useParams();
  const project = useStore((s) => s.getProject(projectId));
  const navigate = useNavigate();

  if (!project) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Project not found. <Link to="/" className="text-primary underline">Go back</Link>
      </div>
    );
  }

  const onSelect = (id: string) =>
    navigate({
      to: "/projects/$projectId/features/$featureId",
      params: { projectId, featureId: id },
    });

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
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="mt-1.5 block truncate text-sm font-semibold hover:text-primary"
          >
            {project.name}
          </Link>
        </div>
        <div className="h-[calc(100%-65px)]">
          <FeatureTree projectId={projectId} selectedId={featureId} onSelect={onSelect} />
        </div>
      </aside>

      <section className="flex-1 overflow-hidden">
        <FeatureDetail featureId={featureId} onSelect={onSelect} />
      </section>
    </div>
  );
}
