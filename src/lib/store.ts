import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  Project,
  Feature,
  Relation,
  HistoryEntry,
  FeatureNode,
  Status,
  Priority,
  ProjectStatus,
  RelationType,
} from "./types";

const now = () => new Date().toISOString();
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

// ---------- Seed ----------
const p1 = "proj_auth";
const p2 = "proj_billing";
const p3 = "proj_mobile";

const seedProjects: Project[] = [
  {
    id: p1,
    name: "Authentication Platform",
    description: "Unified auth, SSO and session management for all products.",
    color: "violet",
    icon: "Shield",
    status: "active",
    createdAt: daysAgo(45),
    updatedAt: daysAgo(1),
  },
  {
    id: p2,
    name: "Billing & Subscriptions",
    description: "Plans, invoices, metering and dunning workflows.",
    color: "emerald",
    icon: "CreditCard",
    status: "active",
    createdAt: daysAgo(70),
    updatedAt: daysAgo(3),
  },
  {
    id: p3,
    name: "Mobile App v2",
    description: "Rewrite with offline-first sync and modular widgets.",
    color: "amber",
    icon: "Smartphone",
    status: "archived",
    createdAt: daysAgo(220),
    updatedAt: daysAgo(60),
  },
];

let order = 0;
const mk = (
  partial: Partial<Feature> & { name: string; projectId: string; parentId: string | null }
): Feature => ({
  id: nanoid(8),
  description: "",
  status: "todo",
  priority: "medium",
  assignee: null,
  tags: [],
  acceptanceCriteria: [],
  targetDate: null,
  createdAt: daysAgo(10),
  updatedAt: daysAgo(1),
  order: order++,
  ...partial,
});

const f_login = mk({
  projectId: p1,
  parentId: null,
  name: "Email & Password Login",
  status: "done",
  priority: "high",
  assignee: "Alex Chen",
  tags: ["core", "security"],
  description:
    "Standard email + password sign in with rate limiting and bot detection.\n\n## Flow\n1. User enters credentials\n2. Backend verifies hash\n3. Issue JWT + refresh token",
  acceptanceCriteria: [
    { id: nanoid(6), text: "Rate limit: 5 attempts / minute", done: true },
    { id: nanoid(6), text: "Lockout after 10 failures", done: true },
    { id: nanoid(6), text: "Audit log entry written", done: false },
  ],
});
const f_oauth = mk({
  projectId: p1,
  parentId: null,
  name: "OAuth Providers",
  status: "in_progress",
  priority: "high",
  assignee: "Sam Patel",
  tags: ["oauth", "integration"],
  description: "Support Google, GitHub, and Apple sign-in.",
});
const f_oauth_google = mk({
  projectId: p1,
  parentId: f_oauth.id,
  name: "Google Sign-In",
  status: "done",
  priority: "high",
  assignee: "Sam Patel",
  tags: ["oauth"],
});
const f_oauth_github = mk({
  projectId: p1,
  parentId: f_oauth.id,
  name: "GitHub Sign-In",
  status: "in_progress",
  priority: "medium",
  assignee: "Sam Patel",
  tags: ["oauth"],
});
const f_oauth_apple = mk({
  projectId: p1,
  parentId: f_oauth.id,
  name: "Apple Sign-In",
  status: "todo",
  priority: "medium",
  tags: ["oauth"],
});
const f_mfa = mk({
  projectId: p1,
  parentId: null,
  name: "Multi-Factor Authentication",
  status: "in_progress",
  priority: "critical",
  assignee: "Jordan Lee",
  tags: ["security", "mfa"],
  description: "TOTP and WebAuthn second factor.",
});
const f_mfa_totp = mk({
  projectId: p1,
  parentId: f_mfa.id,
  name: "TOTP (Authenticator App)",
  status: "done",
  priority: "high",
  assignee: "Jordan Lee",
});
const f_mfa_webauthn = mk({
  projectId: p1,
  parentId: f_mfa.id,
  name: "WebAuthn / Passkeys",
  status: "in_progress",
  priority: "critical",
  assignee: "Jordan Lee",
  tags: ["passkeys"],
});
const f_session = mk({
  projectId: p1,
  parentId: null,
  name: "Session Management",
  status: "todo",
  priority: "medium",
  tags: ["session"],
});
const f_recovery = mk({
  projectId: p1,
  parentId: null,
  name: "Account Recovery (Deprecated SMS)",
  status: "deprecated",
  priority: "low",
  tags: ["legacy"],
});

// Billing
const f_plans = mk({
  projectId: p2,
  parentId: null,
  name: "Subscription Plans",
  status: "done",
  priority: "high",
  assignee: "Mira Cole",
  tags: ["plans"],
});
const f_invoice = mk({
  projectId: p2,
  parentId: null,
  name: "Invoicing",
  status: "in_progress",
  priority: "high",
  assignee: "Mira Cole",
  tags: ["invoice", "pdf"],
});
const f_invoice_pdf = mk({
  projectId: p2,
  parentId: f_invoice.id,
  name: "PDF Generation",
  status: "in_progress",
  priority: "medium",
});
const f_invoice_email = mk({
  projectId: p2,
  parentId: f_invoice.id,
  name: "Email Delivery",
  status: "todo",
  priority: "medium",
});
const f_dunning = mk({
  projectId: p2,
  parentId: null,
  name: "Dunning & Retries",
  status: "todo",
  priority: "high",
  tags: ["payments"],
});

const seedFeatures: Feature[] = [
  f_login,
  f_oauth,
  f_oauth_google,
  f_oauth_github,
  f_oauth_apple,
  f_mfa,
  f_mfa_totp,
  f_mfa_webauthn,
  f_session,
  f_recovery,
  f_plans,
  f_invoice,
  f_invoice_pdf,
  f_invoice_email,
  f_dunning,
];

const seedRelations: Relation[] = [
  { id: nanoid(6), fromId: f_mfa.id, toId: f_login.id, type: "depends_on" },
  { id: nanoid(6), fromId: f_oauth.id, toId: f_session.id, type: "related_to" },
  { id: nanoid(6), fromId: f_recovery.id, toId: f_mfa.id, type: "duplicates" },
];

const seedHistory: HistoryEntry[] = [
  {
    id: nanoid(6),
    featureId: f_mfa_webauthn.id,
    user: "Jordan Lee",
    timestamp: daysAgo(2),
    action: "Changed status from Todo → In Progress",
  },
  {
    id: nanoid(6),
    featureId: f_mfa_webauthn.id,
    user: "Jordan Lee",
    timestamp: daysAgo(1),
    action: "Updated description",
    before: "Initial draft for passkey support.",
    after: "TOTP and WebAuthn second factor with passkey enrollment flow.",
  },
  {
    id: nanoid(6),
    featureId: f_login.id,
    user: "Alex Chen",
    timestamp: daysAgo(5),
    action: "Marked as Done",
  },
];

// ---------- Store ----------
interface Store {
  projects: Project[];
  features: Feature[];
  relations: Relation[];
  history: HistoryEntry[];

  // projects
  createProject: (data: Partial<Project> & { name: string }) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // features
  createFeature: (data: Partial<Feature> & { name: string; projectId: string }) => Feature;
  updateFeature: (id: string, patch: Partial<Feature>, actor?: string) => void;
  deleteFeature: (id: string) => void;
  duplicateFeature: (id: string) => Feature | null;
  moveFeature: (id: string, newParentId: string | null) => void;

  // relations
  addRelation: (fromId: string, toId: string, type: RelationType) => void;
  removeRelation: (id: string) => void;

  // selectors
  getProject: (id: string) => Project | undefined;
  getFeature: (id: string) => Feature | undefined;
  getProjectFeatures: (projectId: string) => Feature[];
  getTree: (projectId: string) => FeatureNode[];
  getBreadcrumb: (featureId: string) => Feature[];
  getChildren: (featureId: string) => Feature[];
  getRelations: (featureId: string) => Relation[];
  getHistory: (featureId: string) => HistoryEntry[];
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

export const useStore = create<Store>((set, get) => ({
  projects: seedProjects,
  features: seedFeatures,
  relations: seedRelations,
  history: seedHistory,

  createProject: (data) => {
    const project: Project = {
      id: nanoid(8),
      name: data.name,
      description: data.description ?? "",
      color: data.color ?? "violet",
      icon: data.icon ?? "Folder",
      status: data.status ?? "active",
      createdAt: now(),
      updatedAt: now(),
    };
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },
  updateProject: (id, patch) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: now() } : p
      ),
    })),
  deleteProject: (id) =>
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      features: s.features.filter((f) => f.projectId !== id),
    })),

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
    return get().createFeature({
      ...original,
      name: `${original.name} (copy)`,
    });
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
      // detect simple circular for depends_on
      if (type === "depends_on") {
        const exists = s.relations.some(
          (r) => r.type === "depends_on" && r.fromId === toId && r.toId === fromId
        );
        if (exists) return s;
      }
      return {
        relations: [
          ...s.relations,
          { id: nanoid(6), fromId, toId, type },
        ],
      };
    });
  },
  removeRelation: (id) =>
    set((s) => ({ relations: s.relations.filter((r) => r.id !== id) })),

  getProject: (id) => get().projects.find((p) => p.id === id),
  getFeature: (id) => get().features.find((f) => f.id === id),
  getProjectFeatures: (projectId) =>
    get().features.filter((f) => f.projectId === projectId),
  getTree: (projectId) =>
    buildTree(get().features.filter((f) => f.projectId === projectId)),
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
}));

export function labelStatus(s: Status): string {
  return {
    todo: "Todo",
    in_progress: "In Progress",
    done: "Done",
    deprecated: "Deprecated",
  }[s];
}

export function labelPriority(p: Priority): string {
  return { low: "Low", medium: "Medium", high: "High", critical: "Critical" }[p];
}

export function labelProjectStatus(s: ProjectStatus): string {
  return s === "active" ? "Active" : "Archived";
}

export function labelRelation(r: RelationType): string {
  return {
    depends_on: "Depends on",
    blocks: "Blocks",
    related_to: "Related to",
    duplicates: "Duplicates",
  }[r];
}
