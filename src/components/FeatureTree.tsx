import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ChevronDown, Plus, Search, Circle, Loader2, CheckCircle2, Archive } from "lucide-react";
import type { FeatureNode, Status } from "@/lib/types";
import { useStore } from "@/lib/store";

const StatusIcon = ({ status }: { status: Status }) => {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (status === "done") return <CheckCircle2 className={`${cls} text-status-done`} />;
  if (status === "in_progress") return <Loader2 className={`${cls} text-status-progress`} />;
  if (status === "deprecated") return <Archive className={`${cls} text-status-deprecated`} />;
  return <Circle className={`${cls} text-status-todo`} />;
};

interface Props {
  projectId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function FeatureTree({ projectId, selectedId, onSelect }: Props) {
  const features = useStore((s) => s.features);
  const filtered = features.filter((f) => f.projectId === projectId);
  const map = new Map<string, FeatureNode>();
  filtered.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const tree: FeatureNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      tree.push(node);
    }
  });
  const sortRec = (nodes: FeatureNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(tree);
  const createFeature = useStore((s) => s.createFeature);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    const collect = (nodes: FeatureNode[]) => {
      nodes.forEach((n) => {
        if (n.children.length) ids.add(n.id);
        collect(n.children);
      });
    };
    collect(tree);
    return ids;
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const matches = (node: FeatureNode): boolean => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    if (node.name.toLowerCase().includes(q)) return true;
    return node.children.some(matches);
  };

  const addRoot = () => {
    const f = createFeature({ projectId, parentId: null, name: "Untitled Feature" });
    onSelect(f.id);
  };

  const addChild = (parentId: string) => {
    const f = createFeature({ projectId, parentId, name: "Untitled Sub-feature" });
    setExpanded((s) => new Set(s).add(parentId));
    onSelect(f.id);
  };

  const renderNode = (node: FeatureNode, depth: number): React.ReactNode => {
    if (!matches(node)) return null;
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id) || query.trim().length > 0;
    const isSelected = selectedId === node.id;

    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1 rounded-md py-1 pr-1 text-sm transition-colors ${
            isSelected ? "bg-sidebar-accent text-foreground" : "hover:bg-muted/60"
          }`}
          style={{ paddingLeft: 4 + depth * 14 }}
        >
          <button
            onClick={() => hasChildren && toggle(node.id)}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-muted"
          >
            {hasChildren ? (
              isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-border" />
            )}
          </button>
          <button
            onClick={() => onSelect(node.id)}
            className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
          >
            <StatusIcon status={node.status} />
            <span className={`truncate ${node.status === "deprecated" ? "line-through opacity-70" : ""}`}>
              {node.name}
            </span>
          </button>
          <button
            onClick={() => addChild(node.id)}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
            title="Add sub-feature"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {hasChildren && isOpen && (
          <div>{node.children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features…"
            className="w-full rounded-md border border-sidebar-border bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto p-2">
        {tree.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No features yet. Create one to get started.
          </p>
        ) : (
          tree.map((n) => renderNode(n, 0))
        )}
      </div>
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={addRoot}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add feature
        </button>
      </div>
    </div>
  );
}
