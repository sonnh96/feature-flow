import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  Feature,
  Relation,
  HistoryEntry,
  FeatureNode,
  Status,
  Priority,
  RelationType,
} from "./types";

const now = () => new Date().toISOString();

// In-memory feature/relation/history store keyed by project id.
// Projects are stored in Supabase (see lib/projects.ts and useProjects hook).

interface Store {
  features: Feature[];
  relations: Relation[];
  history: HistoryEntry[];
  seededProjectIds: Set<string>;

  ensureSeeded: (projectId: string, withSampleData?: boolean) => void;

  createFeature: (data: Partial<Feature> & { name: string; projectId: string }) => Feature;
  updateFeature: (id: string, patch: Partial<Feature>, actor?: string) => void;
  deleteFeature: (id: string) => void;
  duplicateFeature: (id: string) => Feature | null;
  moveFeature: (id: string, newParentId: string | null) => void;

  addRelation: (fromId: string, toId: string, type: RelationType) => void;
  removeRelation: (id: string) => void;

  getFeature: (id: string) => Feature | undefined;
  getProjectFeatures: (projectId: string) => Feature[];
  getTree: (projectId: string) => FeatureNode[];
  getBreadcrumb: (featureId: string) => Feature[];
  getChildren: (featureId: string) => Feature[];
  getRelations: (featureId: string) => Relation[];
  getHistory: (featureId: string) => HistoryEntry[];

  // For global search, we expose all features
  removeProjectData: (projectId: string) => void;
}

function buildTree(features: Feature[]): FeatureNode[] {
  const map = new Map<string, FeatureNode>();
  features.forEach((f) => map.set(f.id, { ...f, children: [] }));
  const roots: FeatureNode[] = [];
  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sortRec = (nodes: FeatureNode[]) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function labelStatus(s: Status): string {
  return { todo: "Todo", in_progress: "In Progress", done: "Done", deprecated: "Deprecated" }[s];
}
export function labelPriority(p: Priority): string {
  return { low: "Low", medium: "Medium", high: "High", critical: "Critical" }[p];
}
export function labelRelation(r: RelationType): string {
  return { depends_on: "Depends on", blocks: "Blocks", related_to: "Related to", duplicates: "Duplicates" }[r];
}
export function labelProjectStatus(s: "active" | "archived"): string {
  return s === "active" ? "Active" : "Archived";
}

let orderCounter = 1000;

function buildSampleFeatures(projectId: string): { features: Feature[]; relations: Relation[]; history: HistoryEntry[] } {
  const mk = (
    p: Partial<Feature> & { name: string; parentId: string | null }
  ): Feature => ({
    id: nanoid(8),
    projectId,
    parentId: p.parentId,
    name: p.name,
    description: p.description ?? "",
    status: p.status ?? "todo",
    priority: p.priority ?? "medium",
    assignee: p.assignee ?? null,
    tags: p.tags ?? [],
    acceptanceCriteria: p.acceptanceCriteria ?? [],
    targetDate: null,
    createdAt: now(),
    updatedAt: now(),
    order: orderCounter++,
  });

  const a = mk({
    name: "Email & Password Login",
    parentId: null,
    status: "done",
    priority: "high",
    assignee: "You",
    tags: ["core"],
    description: "Standard email + password sign in.",
  });
  const b = mk({
    name: "OAuth Providers",
    parentId: null,
    status: "in_progress",
    priority: "high",
    tags: ["oauth"],
  });
  const b1 = mk({ name: "Google Sign-In", parentId: b.id, status: "done", priority: "high" });
  const b2 = mk({ name: "GitHub Sign-In", parentId: b.id, status: "in_progress", priority: "medium" });
  const c = mk({ name: "Multi-Factor Authentication", parentId: null, status: "todo", priority: "critical", tags: ["security"] });

  const features = [a, b, b1, b2, c];
  const relations: Relation[] = [
    { id: nanoid(6), fromId: c.id, toId: a.id, type: "depends_on" },
  ];
  const history: HistoryEntry[] = [
    { id: nanoid(6), featureId: a.id, user: "You", timestamp: now(), action: "Marked as Done" },
  ];
  return { features, relations, history };
}

export const useStore = create<Store>((set, get) => ({
  features: [],
  relations: [],
  history: [],
  seededProjectIds: new Set(),

  ensureSeeded: (projectId, withSampleData = false) => {
    const s = get();
    if (s.seededProjectIds.has(projectId)) return;
    const next = new Set(s.seededProjectIds);
    next.add(projectId);
    if (!withSampleData) {
      set({ seededProjectIds: next });
      return;
    }
    const { features, relations, history } = buildSampleFeatures(projectId);
    set({
      features: [...s.features, ...features],
      relations: [...s.relations, ...relations],
      history: [...history, ...s.history],
      seededProjectIds: next,
    });
  },

  createFeature: (data) => {
    const maxOrder = Math.max(
      0,
      ...get()
        .features.filter(
          (f) =>
            f.projectId === data.projectId && f.parentId === (data.parentId ?? null)
        )
        .map((f) => f.order)
    );
    const feature: Feature = {
      id: nanoid(8),
      projectId: data.projectId,
      parentId: data.parentId ?? null,
      name: data.name,
      description: data.description ?? "",
      status: data.status ?? "todo",
      priority: data.priority ?? "medium",
      assignee: data.assignee ?? null,
      tags: data.tags ?? [],
      acceptanceCriteria: data.acceptanceCriteria ?? [],
      targetDate: data.targetDate ?? null,
      createdAt: now(),
      updatedAt: now(),
      order: maxOrder + 1,
    };
    set((s) => ({
      features: [...s.features, feature],
      history: [
        {
          id: nanoid(6),
          featureId: feature.id,
          user: "You",
          timestamp: now(),
          action: `Created feature "${feature.name}"`,
        },
        ...s.history,
      ],
    }));
    return feature;
  },
  updateFeature: (id, patch, actor = "You") =>
    set((s) => {
      const prev = s.features.find((f) => f.id === id);
      if (!prev) return s;
      const updated = { ...prev, ...patch, updatedAt: now() };
      const entries: HistoryEntry[] = [];
      if (patch.status && patch.status !== prev.status) {
        entries.push({
          id: nanoid(6),
          featureId: id,
          user: actor,
          timestamp: now(),
          action: `Changed status from ${labelStatus(prev.status)} → ${labelStatus(patch.status)}`,
        });
      }
      if (patch.name && patch.name !== prev.name) {
        entries.push({
          id: nanoid(6),
          featureId: id,
          user: actor,
          timestamp: now(),
          action: `Renamed "${prev.name}" → "${patch.name}"`,
        });
      }
      if (patch.description !== undefined && patch.description !== prev.description) {
        entries.push({
          id: nanoid(6),
          featureId: id,
          user: actor,
          timestamp: now(),
          action: "Updated description",
          before: prev.description,
          after: patch.description,
        });
      }
      return {
        features: s.features.map((f) => (f.id === id ? updated : f)),
        history: [...entries, ...s.history],
      };
    }),
  deleteFeature: (id) =>
    set((s) => {
      const toDelete = new Set<string>();
      const collect = (fid: string) => {
        toDelete.add(fid);
        s.features.filter((f) => f.parentId === fid).forEach((c) => collect(c.id));
      };
      collect(id);
      return {
        features: s.features.filter((f) => !toDelete.has(f.id)),
        relations: s.relations.filter(
          (r) => !toDelete.has(r.fromId) && !toDelete.has(r.toId)
        ),
      };
    }),
  duplicateFeature: (id) => {
    const original = get().features.find((f) => f.id === id);
    if (!original) return null;
    return get().createFeature({ ...original, name: `${original.name} (copy)` });
  },
  moveFeature: (id, newParentId) =>
    set((s) => ({
      features: s.features.map((f) =>
        f.id === id ? { ...f, parentId: newParentId, updatedAt: now() } : f
      ),
    })),

  addRelation: (fromId, toId, type) => {
    if (fromId === toId) return;
    set((s) => {
      if (type === "depends_on") {
        const exists = s.relations.some(
          (r) => r.type === "depends_on" && r.fromId === toId && r.toId === fromId
        );
        if (exists) return s;
      }
      return { relations: [...s.relations, { id: nanoid(6), fromId, toId, type }] };
    });
  },
  removeRelation: (id) =>
    set((s) => ({ relations: s.relations.filter((r) => r.id !== id) })),

  getFeature: (id) => get().features.find((f) => f.id === id),
  getProjectFeatures: (projectId) => get().features.filter((f) => f.projectId === projectId),
  getTree: (projectId) => buildTree(get().features.filter((f) => f.projectId === projectId)),
  getBreadcrumb: (featureId) => {
    const trail: Feature[] = [];
    let cur = get().features.find((f) => f.id === featureId);
    while (cur) {
      trail.unshift(cur);
      cur = cur.parentId ? get().features.find((f) => f.id === cur!.parentId) : undefined;
    }
    return trail;
  },
  getChildren: (featureId) =>
    get().features.filter((f) => f.parentId === featureId).sort((a, b) => a.order - b.order),
  getRelations: (featureId) =>
    get().relations.filter((r) => r.fromId === featureId || r.toId === featureId),
  getHistory: (featureId) =>
    get().history.filter((h) => h.featureId === featureId).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),

  removeProjectData: (projectId) =>
    set((s) => {
      const featureIds = new Set(s.features.filter((f) => f.projectId === projectId).map((f) => f.id));
      const next = new Set(s.seededProjectIds);
      next.delete(projectId);
      return {
        features: s.features.filter((f) => f.projectId !== projectId),
        relations: s.relations.filter((r) => !featureIds.has(r.fromId) && !featureIds.has(r.toId)),
        history: s.history.filter((h) => !featureIds.has(h.featureId)),
        seededProjectIds: next,
      };
    }),
}));
