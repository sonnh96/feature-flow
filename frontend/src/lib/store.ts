import { create } from "zustand";
import { toast } from "sonner";
import type {
  Feature,
  Relation,
  HistoryEntry,
  FeatureNode,
  Status,
  Priority,
  RelationType,
  FeatureType,
  FeatureLink,
  FeatureAttachment,
  ApiFeature,
} from "./types";
import { apiFetch } from "./api";

const now = () => new Date().toISOString();

// API-backed feature/relation/history store keyed by project id.
// The zustand state acts as a client-side cache; every mutation is persisted
// to the FastAPI backend via apiFetch. Projects live in lib/projects.ts.

interface Store {
  features: Feature[];
  relations: Relation[];
  history: HistoryEntry[];
  loadedProjects: Set<string>;

  loadProjectFeatures: (projectId: string) => Promise<void>;
  loadFeaturesForProjects: (projectIds: string[]) => Promise<void>;
  loadFeature: (featureId: string) => Promise<void>;
  loadFeatureDetail: (featureId: string) => Promise<void>;

  createFeature: (data: Partial<Feature> & { name: string; projectId: string }) => Promise<Feature>;
  updateFeature: (id: string, patch: Partial<Feature>, actor?: string) => Promise<boolean>;
  deleteFeature: (id: string) => Promise<boolean>;
  duplicateFeature: (id: string) => Promise<Feature | null>;
  moveFeature: (id: string, newParentId: string | null) => Promise<boolean>;
  upsertApiFeatures: (items: ApiFeature[]) => void;

  addRelation: (fromId: string, toId: string, type: RelationType) => Promise<void>;
  removeRelation: (id: string) => Promise<void>;

  getFeature: (id: string) => Feature | undefined;
  getProjectFeatures: (projectId: string) => Feature[];
  getTree: (projectId: string) => FeatureNode[];
  getBreadcrumb: (featureId: string) => Feature[];
  getChildren: (featureId: string) => Feature[];
  getRelations: (featureId: string) => Relation[];
  getHistory: (featureId: string) => HistoryEntry[];

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
  return (
    { todo: "Todo", in_progress: "In Progress", done: "Done", deprecated: "Deprecated" }[s] ?? s
  );
}
export function labelPriority(p: Priority): string {
  return { low: "Low", medium: "Medium", high: "High", critical: "Critical" }[p] ?? p;
}
export function labelRelation(r: RelationType): string {
  return (
    {
      depends_on: "Depends on",
      blocks: "Blocks",
      related_to: "Relates to",
      relates_to: "Relates to",
      duplicates: "Duplicate of",
      duplicate_of: "Duplicate of",
      references: "References",
    }[r] ?? r
  );
}
export function labelProjectStatus(s: "active" | "archived"): string {
  return s === "active" ? "Active" : "Archived";
}
export function labelFeatureType(s: FeatureType): string {
  return { epic: "Epic", feature: "Feature", sub_feature: "Sub-feature" }[s] ?? s;
}
export function labelReviewStatus(s: string): string {
  return (
    {
      draft: "Draft",
      needs_review: "Needs Review",
      approved: "Approved",
      rejected: "Rejected",
      archived: "Archived",
      stale: "Stale",
    }[s] ?? s
  );
}

function deriveFeatureType(parentId: string | null, features: Feature[]): FeatureType {
  if (!parentId) return "epic";
  const parent = features.find((f) => f.id === parentId);
  return parent?.parentId ? "sub_feature" : "feature";
}

function normalizeBusinessRules(
  value: ApiFeature["business_rules"] | ApiFeature["businessRules"],
): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value
    .map((item) => {
      if (typeof item.rule === "string") return item.rule;
      if (typeof item.text === "string") return item.text;
      return JSON.stringify(item);
    })
    .join("\n");
}

let orderCounter = 1000;

function fromApiFeature(item: ApiFeature): Feature {
  const featureCode = item.feature_code ?? item.featureCode ?? item.code ?? "";
  const markdown = item.markdown_content ?? item.markdownContent ?? "";
  const shortDescription =
    item.short_description ?? item.shortDescription ?? item.description ?? "";
  const metadata = (item.metadata ?? null) as {
    links?: FeatureLink[];
    attachments?: FeatureAttachment[];
  } | null;
  return {
    id: item.id,
    projectId: item.project_id ?? item.projectId ?? "",
    parentId: item.parent_id ?? item.parentId ?? null,
    featureCode,
    code: featureCode,
    name: item.name,
    description: markdown || shortDescription,
    shortDescription,
    longDescription: item.long_description ?? item.longDescription ?? shortDescription,
    featureType: item.feature_type ?? item.featureType ?? "feature",
    status: item.status ?? "todo",
    reviewStatus: item.review_status ?? item.reviewStatus ?? "draft",
    priority: item.priority ?? "medium",
    assignee: item.assignee ?? null,
    tags: item.tags ?? [],
    acceptanceCriteria: item.acceptance_criteria ?? item.acceptanceCriteria ?? [],
    businessRules: normalizeBusinessRules(item.business_rules ?? item.businessRules),
    confidenceScore: item.confidence_score ?? item.confidenceScore ?? 1,
    currentVersion: item.current_version ?? item.currentVersion ?? 1,
    generatedBy: item.generated_by ?? item.generatedBy ?? null,
    approvedBy: item.approved_by ?? item.approvedBy ?? null,
    targetDate: item.target_date ?? item.targetDate ?? null,
    createdAt: item.created_at ?? item.createdAt ?? now(),
    updatedAt: item.updated_at ?? item.updatedAt ?? item.created_at ?? item.createdAt ?? now(),
    order: item.position ?? item.order ?? orderCounter++,
    links: metadata?.links ?? [],
    attachments: metadata?.attachments ?? [],
  };
}

export { fromApiFeature };

interface ApiRelation {
  id: string;
  source_feature_id: string;
  target_feature_id: string;
  relation_type: string;
}

function fromApiRelation(r: ApiRelation): Relation {
  return {
    id: r.id,
    fromId: r.source_feature_id,
    toId: r.target_feature_id,
    type: r.relation_type as RelationType,
  };
}

interface ApiHistory {
  id: string;
  feature_id: string;
  event_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string | null;
  notes: string | null;
}

function describeHistory(h: ApiHistory): string {
  switch (h.event_type) {
    case "FeatureCreated":
      return h.new_value ? `Created feature "${h.new_value}"` : "Created feature";
    case "FeatureFieldChanged":
      if (h.field_name === "status")
        return `Changed status${h.old_value ? ` from ${labelStatus(h.old_value as Status)}` : ""} → ${labelStatus((h.new_value ?? "") as Status)}`;
      if (h.field_name === "name")
        return `Renamed${h.old_value ? ` "${h.old_value}"` : ""} → "${h.new_value ?? ""}"`;
      return `Updated ${h.field_name ?? "field"}`;
    case "FeatureApproved":
      return "Approved feature";
    case "FeatureRejected":
      return "Rejected feature";
    case "FeatureReparented":
      return "Moved to a new parent";
    case "RelationAdded":
      return "Added a relation";
    case "RelationRemoved":
      return "Removed a relation";
    case "FeatureVersionCreated":
      return `Saved version v${h.new_value ?? ""}`;
    case "FeatureMerged":
      return "Merged into another feature";
    case "FeatureSplit":
      return "Split into sub-features";
    default:
      return h.field_name ? `Updated ${h.field_name}` : h.event_type || "Updated";
  }
}

function fromApiHistory(h: ApiHistory): HistoryEntry {
  return {
    id: h.id,
    featureId: h.feature_id,
    user: h.changed_by || "system",
    userId: h.changed_by || undefined,
    timestamp: h.changed_at || now(),
    action: describeHistory(h),
    eventType: h.event_type,
    fieldName: h.field_name || undefined,
    oldValue: h.old_value,
    newValue: h.new_value,
    before: h.old_value ?? undefined,
    after: h.new_value ?? undefined,
    comment: h.notes ?? null,
  };
}

// Build a backend payload from a partial Feature patch (camelCase → snake_case).
function toFeaturePayload(patch: Partial<Feature>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.featureType !== undefined) body.feature_type = patch.featureType;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.priority !== undefined) body.priority = patch.priority;
  if (patch.reviewStatus !== undefined) body.review_status = patch.reviewStatus;
  if (patch.assignee !== undefined) body.assignee = patch.assignee;
  if (patch.targetDate !== undefined)
    body.target_date = patch.targetDate ? patch.targetDate.slice(0, 10) : null;
  if (patch.tags !== undefined) body.tags = patch.tags;
  if (patch.description !== undefined) body.markdown_content = patch.description;
  if (patch.businessRules !== undefined) body.business_rules = patch.businessRules;
  if (patch.acceptanceCriteria !== undefined) body.acceptance_criteria = patch.acceptanceCriteria;
  if (patch.featureCode !== undefined) body.feature_code = patch.featureCode;
  if (patch.parentId !== undefined) body.parent_id = patch.parentId;
  if (patch.links !== undefined || patch.attachments !== undefined) {
    body.metadata = { links: patch.links ?? [], attachments: patch.attachments ?? [] };
  }
  return body;
}

export const useStore = create<Store>((set, get) => ({
  features: [],
  relations: [],
  history: [],
  loadedProjects: new Set(),

  loadProjectFeatures: async (projectId) => {
    try {
      const items: ApiFeature[] = await apiFetch(`/api/v1/projects/${projectId}/features`);
      const incoming = (items ?? []).map(fromApiFeature);
      set((s) => {
        const others = s.features.filter((f) => f.projectId !== projectId);
        const loaded = new Set(s.loadedProjects);
        loaded.add(projectId);
        return { features: [...others, ...incoming], loadedProjects: loaded };
      });
    } catch (e) {
      console.error("Failed to load features", e);
    }
  },

  loadFeaturesForProjects: async (projectIds) => {
    if (!projectIds.length) return;
    const results = await Promise.all(
      projectIds.map(async (pid) => {
        try {
          const items: ApiFeature[] = await apiFetch(`/api/v1/projects/${pid}/features`);
          return items ?? [];
        } catch {
          return [];
        }
      }),
    );
    set((s) => {
      const incomingIds = new Set(projectIds);
      const others = s.features.filter((f) => !incomingIds.has(f.projectId));
      const incoming = results.flat().map(fromApiFeature);
      const loaded = new Set(s.loadedProjects);
      projectIds.forEach((p) => loaded.add(p));
      return { features: [...others, ...incoming], loadedProjects: loaded };
    });
  },

  loadFeature: async (featureId) => {
    try {
      const data = await apiFetch(`/api/v1/features/${featureId}`);
      const feature = fromApiFeature(data);
      set((s) => ({
        features: s.features.some((f) => f.id === feature.id)
          ? s.features.map((f) => (f.id === feature.id ? feature : f))
          : [...s.features, feature],
      }));
      if (Array.isArray(data?.relations)) {
        const rels = (data.relations as ApiRelation[]).map(fromApiRelation);
        set((s) => {
          const relById = new Map(s.relations.map((r) => [r.id, r]));
          rels.forEach((r) => relById.set(r.id, r));
          return { relations: [...relById.values()] };
        });
      }
    } catch (e) {
      console.error("Failed to load feature", e);
    }
  },

  loadFeatureDetail: async (featureId) => {
    try {
      const [rels, hist] = await Promise.all([
        apiFetch(`/api/v1/features/${featureId}/relations`),
        apiFetch(`/api/v1/features/${featureId}/history`),
      ]);
      const relations = ((rels as ApiRelation[]) ?? []).map(fromApiRelation);
      const history = ((hist as ApiHistory[]) ?? []).map(fromApiHistory);
      set((s) => {
        const relById = new Map(s.relations.map((r) => [r.id, r]));
        relations.forEach((r) => relById.set(r.id, r));
        const histById = new Map(s.history.map((h) => [h.id, h]));
        history.forEach((h) => histById.set(h.id, h));
        return {
          relations: [...relById.values()],
          history: [...histById.values()],
        };
      });
    } catch (e) {
      console.error("Failed to load feature detail", e);
    }
  },

  createFeature: async (data) => {
    const parentId = data.parentId ?? null;
    const payload = toFeaturePayload({
      ...data,
      featureType: data.featureType ?? deriveFeatureType(parentId, get().features),
      parentId,
    });
    const created: ApiFeature = await apiFetch(
      `/api/v1/features/?project_id=${encodeURIComponent(data.projectId)}`,
      { method: "POST", body: JSON.stringify(payload) },
    );
    const feature = fromApiFeature(created);
    set((s) => ({ features: [...s.features, feature] }));
    void get().loadFeatureDetail(feature.id);
    return feature;
  },

  updateFeature: async (id, patch, actor = "You") => {
    const prev = get().features.find((f) => f.id === id);
    if (!prev) return false;
    // optimistic
    set((s) => ({
      features: s.features.map((f) =>
        f.id === id
          ? { ...f, ...patch, code: patch.featureCode ?? f.featureCode, updatedAt: now() }
          : f,
      ),
    }));
    try {
      const body = toFeaturePayload(patch);
      if (actor) body.updated_by = actor;
      const updated: ApiFeature = await apiFetch(`/api/v1/features/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const merged = fromApiFeature(updated);
      set((s) => ({ features: s.features.map((f) => (f.id === id ? merged : f)) }));
      void get().loadFeatureDetail(id);
      return true;
    } catch (e) {
      console.error("Failed to update feature", e);
      toast.error("Failed to save changes");
      set((s) => ({ features: s.features.map((f) => (f.id === id ? prev : f)) }));
      return false;
    }
  },

  deleteFeature: async (id) => {
    const prevFeatures = get().features;
    const prevRelations = get().relations;
    const toDelete = new Set<string>();
    const collect = (fid: string) => {
      toDelete.add(fid);
      prevFeatures.filter((f) => f.parentId === fid).forEach((c) => collect(c.id));
    };
    collect(id);
    set((s) => ({
      features: s.features.filter((f) => !toDelete.has(f.id)),
      relations: s.relations.filter((r) => !toDelete.has(r.fromId) && !toDelete.has(r.toId)),
    }));
    try {
      await apiFetch(`/api/v1/features/${id}?cascade=true`, { method: "DELETE" });
      return true;
    } catch (e) {
      console.error("Failed to delete feature", e);
      toast.error("Failed to delete feature");
      set({ features: prevFeatures, relations: prevRelations });
      return false;
    }
  },

  duplicateFeature: async (id) => {
    const original = get().features.find((f) => f.id === id);
    if (!original) return null;
    try {
      return await get().createFeature({
        projectId: original.projectId,
        parentId: original.parentId,
        name: `${original.name} (copy)`,
        featureType: original.featureType,
        status: original.status,
        priority: original.priority,
        assignee: original.assignee,
        targetDate: original.targetDate,
        tags: original.tags,
        description: original.description,
        businessRules: original.businessRules,
        acceptanceCriteria: original.acceptanceCriteria,
        links: original.links,
        attachments: original.attachments,
      });
    } catch (e) {
      console.error("Failed to duplicate feature", e);
      toast.error("Failed to duplicate feature");
      return null;
    }
  },

  moveFeature: async (id, newParentId) => get().updateFeature(id, { parentId: newParentId }),

  upsertApiFeatures: (items) =>
    set((s) => {
      const incoming = items.map(fromApiFeature);
      const incomingIds = new Set(incoming.map((feature) => feature.id));
      return {
        features: [...s.features.filter((feature) => !incomingIds.has(feature.id)), ...incoming],
      };
    }),

  addRelation: async (fromId, toId, type) => {
    if (fromId === toId) return;
    try {
      const created: ApiRelation = await apiFetch(`/api/v1/features/${fromId}/relations`, {
        method: "POST",
        body: JSON.stringify({ target_feature_id: toId, relation_type: type }),
      });
      const rel = fromApiRelation(created);
      set((s) =>
        s.relations.some((r) => r.id === rel.id) ? s : { relations: [...s.relations, rel] },
      );
      void get().loadFeatureDetail(fromId);
    } catch (e) {
      console.error("Failed to add relation", e);
      toast.error("Failed to link feature");
    }
  },

  removeRelation: async (id) => {
    const prev = get().relations;
    set((s) => ({ relations: s.relations.filter((r) => r.id !== id) }));
    try {
      await apiFetch(`/api/v1/features/relations/${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Failed to remove relation", e);
      toast.error("Failed to remove relation");
      set({ relations: prev });
    }
  },

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
    get()
      .features.filter((f) => f.parentId === featureId)
      .sort((a, b) => a.order - b.order),
  getRelations: (featureId) =>
    get().relations.filter((r) => r.fromId === featureId || r.toId === featureId),
  getHistory: (featureId) =>
    get()
      .history.filter((h) => h.featureId === featureId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),

  removeProjectData: (projectId) =>
    set((s) => {
      const featureIds = new Set(
        s.features.filter((f) => f.projectId === projectId).map((f) => f.id),
      );
      const next = new Set(s.loadedProjects);
      next.delete(projectId);
      return {
        features: s.features.filter((f) => f.projectId !== projectId),
        relations: s.relations.filter((r) => !featureIds.has(r.fromId) && !featureIds.has(r.toId)),
        history: s.history.filter((h) => !featureIds.has(h.featureId)),
        loadedProjects: next,
      };
    }),
}));
