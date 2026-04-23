import { useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { format, formatDistanceToNow } from "date-fns";
import {
  ChevronRight,
  Trash2,
  Copy,
  Share2,
  Plus,
  X,
  Check,
  ExternalLink,
  GripVertical,
} from "lucide-react";
import { useStore, labelStatus, labelRelation } from "@/lib/store";
import { useProject } from "@/lib/projects";
import type { Status, Priority, RelationType, AcceptanceCriterion } from "@/lib/types";
import { StatusBadge, PriorityBadge } from "./StatusBadge";
import { MarkdownEditor } from "./MarkdownEditor";
import { nanoid } from "nanoid";

const STATUSES: Status[] = ["todo", "in_progress", "done", "deprecated"];
const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
const RELATIONS: RelationType[] = ["depends_on", "blocks", "related_to", "duplicates"];

type Tab = "description" | "subfeatures" | "related" | "history";

export function FeatureDetail({
  featureId,
  onSelect,
}: {
  featureId: string;
  onSelect: (id: string) => void;
}) {
  const feature = useStore((s) => s.getFeature(featureId));
  const breadcrumb = useStore((s) => s.getBreadcrumb(featureId));
  const { project } = useProject(feature?.projectId);
  const children = useStore((s) => s.getChildren(featureId));
  const relations = useStore((s) => s.getRelations(featureId));
  const history = useStore((s) => s.getHistory(featureId));
  const updateFeature = useStore((s) => s.updateFeature);
  const deleteFeature = useStore((s) => s.deleteFeature);
  const duplicateFeature = useStore((s) => s.duplicateFeature);
  const createFeature = useStore((s) => s.createFeature);
  const addRelation = useStore((s) => s.addRelation);
  const removeRelation = useStore((s) => s.removeRelation);
  const allFeatures = useStore((s) => s.features);
  const getBreadcrumb = useStore((s) => s.getBreadcrumb);

  const [tab, setTab] = useState<Tab>("description");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [acInput, setAcInput] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    setEditingName(false);
    setTab("description");
  }, [featureId]);

  if (!feature || !project) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Feature not found.
      </div>
    );
  }

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || feature.tags.includes(t)) return;
    updateFeature(featureId, { tags: [...feature.tags, t] });
    setTagInput("");
  };

  const doneCount = children.filter((c) => c.status === "done").length;
  const progress = children.length === 0 ? 0 : Math.round((doneCount / children.length) * 100);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Projects
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="hover:text-foreground"
          >
            {project.name}
          </Link>
          {breadcrumb.slice(0, -1).map((b) => (
            <span key={b.id} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              <button onClick={() => onSelect(b.id)} className="hover:text-foreground">
                {b.name}
              </button>
            </span>
          ))}
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">{feature.name}</span>
        </nav>

        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  if (nameDraft.trim() && nameDraft !== feature.name)
                    updateFeature(featureId, { name: nameDraft.trim() });
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="w-full rounded-md border border-input bg-background px-2 py-1 text-2xl font-semibold tracking-tight outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <h1
                onClick={() => {
                  setNameDraft(feature.name);
                  setEditingName(true);
                }}
                className="cursor-text rounded px-2 py-1 -ml-2 text-2xl font-semibold tracking-tight hover:bg-muted/60"
              >
                {feature.name}
              </h1>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusDropdown
                status={feature.status}
                onChange={(s) => updateFeature(featureId, { status: s })}
              />
              <PriorityDropdown
                priority={feature.priority}
                onChange={(p) => updateFeature(featureId, { priority: p })}
              />
              {feature.tags.map((t) => (
                <span
                  key={t}
                  className="group inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground"
                >
                  {t}
                  <button
                    onClick={() =>
                      updateFeature(featureId, {
                        tags: feature.tags.filter((x) => x !== t),
                      })
                    }
                    className="opacity-0 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="+ tag"
                className="w-20 rounded-md border border-dashed border-border bg-transparent px-2 py-0.5 text-xs outline-none focus:border-solid focus:border-ring"
              />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <IconBtn
              title="Duplicate"
              onClick={() => {
                const dup = duplicateFeature(featureId);
                if (dup) onSelect(dup.id);
              }}
            >
              <Copy className="h-4 w-4" />
            </IconBtn>
            <IconBtn
              title="Copy share link"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
              }}
            >
              <Share2 className="h-4 w-4" />
            </IconBtn>
            <IconBtn
              title="Delete"
              onClick={() => {
                if (confirm(`Delete "${feature.name}" and all its sub-features?`)) {
                  deleteFeature(featureId);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </IconBtn>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-6">
        {(
          [
            ["description", "Description"],
            ["subfeatures", `Sub-features${children.length ? ` · ${children.length}` : ""}`],
            ["related", `Related${relations.length ? ` · ${relations.length}` : ""}`],
            ["history", "Change History"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative px-3 py-2.5 text-sm transition-colors ${
              tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {tab === k && (
              <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">
        {tab === "description" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Section title="Description">
                <MarkdownEditor
                  value={feature.description}
                  onChange={(v) => updateFeature(featureId, { description: v })}
                  placeholder="Write the feature description in Markdown… (headings, lists, code blocks, images all supported)"
                />
              </Section>

              <AcceptanceCriteriaSection
                items={feature.acceptanceCriteria}
                onChange={(next) => updateFeature(featureId, { acceptanceCriteria: next })}
                input={acInput}
                setInput={setAcInput}
              />
            </div>

            <div className="space-y-4">
              <MetaCard label="Assignee">
                <input
                  value={feature.assignee ?? ""}
                  onChange={(e) =>
                    updateFeature(featureId, { assignee: e.target.value || null })
                  }
                  placeholder="Unassigned"
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </MetaCard>
              <MetaCard label="Target date">
                <input
                  type="date"
                  value={feature.targetDate?.slice(0, 10) ?? ""}
                  onChange={(e) =>
                    updateFeature(featureId, {
                      targetDate: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </MetaCard>
              <MetaCard label="Created">
                <span className="text-sm text-muted-foreground">
                  {format(new Date(feature.createdAt), "MMM d, yyyy")}
                </span>
              </MetaCard>
              <MetaCard label="Updated">
                <span className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(feature.updatedAt), { addSuffix: true })}
                </span>
              </MetaCard>
            </div>
          </div>
        )}

        {tab === "subfeatures" && (
          <div className="space-y-4">
            {children.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {doneCount} / {children.length} done · {progress}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-status-done transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <ul className="divide-y divide-border rounded-lg border border-border">
              {children.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40"
                >
                  <StatusBadge status={c.status} />
                  <span className="flex-1 truncate text-sm">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.assignee ?? "—"}</span>
                  <button
                    onClick={() => onSelect(c.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {children.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No sub-features yet.
                </li>
              )}
            </ul>

            <InlineAddSub
              onAdd={(name) => {
                const f = createFeature({
                  projectId: project.id,
                  parentId: featureId,
                  name,
                });
                onSelect(f.id);
              }}
            />
          </div>
        )}

        {tab === "related" && (
          <div className="space-y-4">
            <button
              onClick={() => setLinkOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Link feature
            </button>

            <ul className="divide-y divide-border rounded-lg border border-border">
              {relations.map((r) => {
                const otherId = r.fromId === featureId ? r.toId : r.fromId;
                const other = allFeatures.find((f) => f.id === otherId);
                if (!other) return null;
                const trail = getBreadcrumb(other.id);
                const isOutgoing = r.fromId === featureId;
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                    <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                      {isOutgoing ? labelRelation(r.type) : `← ${labelRelation(r.type)}`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{other.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {trail.slice(0, -1).map((b) => b.name).join(" › ") || "root"}
                      </div>
                    </div>
                    <StatusBadge status={other.status} />
                    <button
                      onClick={() => onSelect(other.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeRelation(r.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
              {relations.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No related features yet.
                </li>
              )}
            </ul>

            {linkOpen && (
              <LinkFeatureModal
                projectId={project.id}
                excludeId={featureId}
                onClose={() => setLinkOpen(false)}
                onPick={(toId, type) => {
                  addRelation(featureId, toId, type);
                  setLinkOpen(false);
                }}
              />
            )}
          </div>
        )}

        {tab === "history" && (
          <ol className="relative ml-3 space-y-4 border-l border-border pl-6">
            {history.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -left-[29px] top-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {h.user.charAt(0)}
                </span>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{h.user}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(h.timestamp), "MMM d, yyyy 'at' HH:mm")}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{h.action}</p>
                {h.before !== undefined && h.after !== undefined && (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                      <span className="text-destructive">- </span>
                      {h.before || <em className="opacity-50">empty</em>}
                    </pre>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-status-done/30 bg-status-done/5 p-2 text-xs">
                      <span className="text-status-done">+ </span>
                      {h.after || <em className="opacity-50">empty</em>}
                    </pre>
                  </div>
                )}
              </li>
            ))}
            {history.length === 0 && (
              <li className="text-sm text-muted-foreground">No history yet.</li>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function MetaCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function StatusDropdown({
  status,
  onChange,
}: {
  status: Status;
  onChange: (s: Status) => void;
}) {
  return (
    <div className="relative">
      <select
        value={status}
        onChange={(e) => onChange(e.target.value as Status)}
        className="appearance-none rounded-md border border-border bg-background py-1 pl-2 pr-7 text-xs font-medium outline-none focus:ring-2 focus:ring-ring"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {labelStatus(s)}
          </option>
        ))}
      </select>
    </div>
  );
}

function PriorityDropdown({
  priority,
  onChange,
}: {
  priority: Priority;
  onChange: (p: Priority) => void;
}) {
  return (
    <select
      value={priority}
      onChange={(e) => onChange(e.target.value as Priority)}
      className="appearance-none rounded-md border border-border bg-background py-1 pl-2 pr-7 text-xs font-medium outline-none focus:ring-2 focus:ring-ring"
    >
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {p[0].toUpperCase() + p.slice(1)}
        </option>
      ))}
    </select>
  );
}

function InlineAddSub({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) {
          onAdd(name.trim());
          setName("");
        }
      }}
      className="flex gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="+ Add sub-feature"
        className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="submit"
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Add
      </button>
    </form>
  );
}

function LinkFeatureModal({
  projectId,
  excludeId,
  onClose,
  onPick,
}: {
  projectId: string;
  excludeId: string;
  onClose: () => void;
  onPick: (toId: string, type: RelationType) => void;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState<RelationType>("related_to");
  const features = useStore((s) => s.getProjectFeatures(projectId));
  const matches = features.filter(
    (f) =>
      f.id !== excludeId &&
      (q.trim() === "" || f.name.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-popover p-4 shadow-[var(--shadow-elevated)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold">Link a feature</h3>
        <div className="mb-3 flex gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as RelationType)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {labelRelation(r)}
              </option>
            ))}
          </select>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search features…"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <ul className="scroll-thin max-h-72 space-y-0.5 overflow-y-auto">
          {matches.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => onPick(f.id, type)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <StatusBadge status={f.status} />
                <span className="truncate">{f.name}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-2 py-4 text-center text-sm text-muted-foreground">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function AcceptanceCriteriaSection({
  items,
  onChange,
  input,
  setInput,
}: {
  items: AcceptanceCriterion[];
  onChange: (next: AcceptanceCriterion[]) => void;
  input: string;
  setInput: (v: string) => void;
}) {
  const dragId = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const doneCount = items.filter((i) => i.done).length;
  const progress = items.length === 0 ? 0 : Math.round((doneCount / items.length) * 100);

  const toggle = (id: string) =>
    onChange(items.map((a) => (a.id === id ? { ...a, done: !a.done } : a)));
  const remove = (id: string) => onChange(items.filter((a) => a.id !== id));
  const update = (id: string, text: string) =>
    onChange(items.map((a) => (a.id === id ? { ...a, text } : a)));

  const add = () => {
    const t = input.trim();
    if (!t) return;
    onChange([...items, { id: nanoid(6), text: t, done: false }]);
    setInput("");
  };

  const handleDrop = (targetId: string) => {
    const fromId = dragId.current;
    dragId.current = null;
    if (!fromId || fromId === targetId) return;
    const fromIdx = items.findIndex((i) => i.id === fromId);
    const toIdx = items.findIndex((i) => i.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onChange(next);
  };

  return (
    <Section title="Acceptance Criteria">
      {items.length > 0 && (
        <div className="mb-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-status-done transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {doneCount}/{items.length} · {progress}%
          </span>
        </div>
      )}

      <ul className="space-y-1">
        {items.map((a) => {
          const isEditing = editingId === a.id;
          return (
            <li
              key={a.id}
              draggable={!isEditing}
              onDragStart={() => (dragId.current = a.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(a.id)}
              className="group flex items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/50"
            >
              <GripVertical className="mt-1 h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/40 opacity-0 group-hover:opacity-100" />
              <button
                onClick={() => toggle(a.id)}
                className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors ${
                  a.done
                    ? "border-status-done bg-status-done text-white"
                    : "border-border hover:border-status-done"
                }`}
                aria-label={a.done ? "Mark incomplete" : "Mark complete"}
              >
                {a.done && <Check className="h-3 w-3" />}
              </button>
              {isEditing ? (
                <input
                  autoFocus
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onBlur={() => {
                    if (editDraft.trim()) update(a.id, editDraft.trim());
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              ) : (
                <span
                  onDoubleClick={() => {
                    setEditDraft(a.text);
                    setEditingId(a.id);
                  }}
                  className={`flex-1 cursor-text text-sm ${
                    a.done ? "text-muted-foreground line-through" : ""
                  }`}
                  title="Double-click to edit"
                >
                  {a.text}
                </span>
              )}
              <button
                onClick={() => remove(a.id)}
                className="opacity-0 group-hover:opacity-100"
                aria-label="Remove criterion"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No criteria yet. Add what "done" looks like.
          </li>
        )}
      </ul>

      <div className="mt-2 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="Add criterion…"
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </Section>
  );
}
