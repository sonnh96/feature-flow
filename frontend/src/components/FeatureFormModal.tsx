import { useState, useRef, useCallback, useEffect } from "react";
import {
  X,
  Plus,
  Link2,
  Paperclip,
  Trash2,
  ExternalLink,
  Loader2,
  FileText,
  Image,
  File,
  ChevronDown,
  Layout,
  Check,
} from "lucide-react";
import { MarkdownEditor } from "./MarkdownEditor";
import { apiFetch, API_BASE } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import type {
  Feature,
  FeatureLink,
  FeatureAttachment,
  FeatureType,
  Status,
  Priority,
  LinkType,
} from "@/lib/types";
import { nanoid } from "nanoid";

// ─── Markdown templates ────────────────────────────────────────────────────
const TEMPLATES: Record<string, { label: string; body: string }> = {
  "user-story": {
    label: "User Story",
    body: `## User Story

As a **[user type]**, I want to **[goal]** so that **[benefit]**.

## Acceptance Criteria

- [ ] Given [context], when [action], then [outcome]
- [ ] ...

## Notes

`,
  },
  "bug-report": {
    label: "Bug Report",
    body: `## Bug Description

Brief description of the issue.

## Steps to Reproduce

1. Go to...
2. Click on...
3. Observe the error

## Expected Behavior

What should happen.

## Actual Behavior

What actually happens.

## Environment

- Browser:
- OS:
- Version:
`,
  },
  "technical-spec": {
    label: "Technical Spec",
    body: `## Overview

Brief description of the technical change.

## Architecture

...

## Implementation Plan

1.
2.
3.

## Dependencies

-

## Testing Strategy

-

## Rollout

`,
  },
  epic: {
    label: "Epic",
    body: `## Goal

High-level description of what this epic achieves.

## Problem Statement

...

## Success Metrics

-

## Features / Stories

- [ ]

## Out of Scope

-
`,
  },
};

// ─── Constants ─────────────────────────────────────────────────────────────
const FEATURE_TYPES: { value: FeatureType; label: string }[] = [
  { value: "epic", label: "Epic" },
  { value: "feature", label: "Feature" },
  { value: "sub_feature", label: "Sub-feature" },
];

const STATUSES: { value: Status; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "deprecated", label: "Deprecated" },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const LINK_TYPES: { value: LinkType; label: string }[] = [
  { value: "reference", label: "Reference" },
  { value: "design", label: "Design" },
  { value: "document", label: "Document" },
  { value: "api", label: "API" },
  { value: "issue", label: "Issue / Ticket" },
  { value: "pr", label: "Pull Request" },
  { value: "dashboard", label: "Dashboard" },
  { value: "other", label: "Other" },
];

const LINK_TYPE_ICON: Record<LinkType, string> = {
  reference: "🔗",
  design: "🎨",
  document: "📄",
  api: "⚡",
  issue: "🐛",
  pr: "🔀",
  dashboard: "📊",
  other: "🔗",
};

// ─── Types ──────────────────────────────────────────────────────────────────
type FormTab = "details" | "links" | "files";

export interface FeatureFormData {
  name: string;
  featureType: FeatureType;
  status: Status;
  priority: Priority;
  assignee: string | null;
  targetDate: string | null;
  tags: string[];
  description: string;
  links: FeatureLink[];
  attachments: FeatureAttachment[];
}

interface Props {
  mode: "create" | "edit";
  projectId: string;
  parentId?: string | null;
  feature?: Feature;
  onClose: () => void;
  onSave: (data: FeatureFormData) => Promise<void>;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function FeatureFormModal({ mode, projectId: _projectId, feature, onClose, onSave }: Props) {
  const { user } = useAuth();

  // Form state
  const [name, setName] = useState(feature?.name ?? "");
  const [featureType, setFeatureType] = useState<FeatureType>(feature?.featureType ?? "feature");
  const [status, setStatus] = useState<Status>(feature?.status ?? "todo");
  const [priority, setPriority] = useState<Priority>(feature?.priority ?? "medium");
  const [assignee, setAssignee] = useState(feature?.assignee ?? "");
  const [targetDate, setTargetDate] = useState(feature?.targetDate?.slice(0, 10) ?? "");
  const [tags, setTags] = useState<string[]>(feature?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [description, setDescription] = useState(feature?.description ?? "");
  const [links, setLinks] = useState<FeatureLink[]>(feature?.links ?? []);
  const [attachments, setAttachments] = useState<FeatureAttachment[]>(feature?.attachments ?? []);

  // UI state
  const [tab, setTab] = useState<FormTab>("details");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");

  // Link form state
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkType, setLinkType] = useState<LinkType>("reference");

  // File upload state
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Tag management ────────────────────────────────────────────────────────
  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  // ── Template insertion ────────────────────────────────────────────────────
  const applyTemplate = (key: string) => {
    const tpl = TEMPLATES[key];
    if (!tpl) return;
    setDescription((prev) => (prev.trim() ? prev + "\n\n" + tpl.body : tpl.body));
    setTab("details");
  };

  // ── Link management ────────────────────────────────────────────────────────
  const addLink = () => {
    const label = linkLabel.trim();
    const url = linkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error("URL must start with http:// or https://");
      return;
    }
    setLinks((prev) => [
      ...prev,
      { id: nanoid(6), label: label || url, url, type: linkType },
    ]);
    setLinkLabel("");
    setLinkUrl("");
    setLinkType("reference");
  };

  const removeLink = (id: string) => setLinks((prev) => prev.filter((l) => l.id !== id));

  // ── File upload ────────────────────────────────────────────────────────────
  const uploadFile = useCallback(
    async (file: File) => {
      if (!user) {
        toast.error("Sign in to upload files");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File must be under 10 MB");
        return;
      }
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        let data: { url: string; name?: string; size?: number; mimeType?: string };

        if (file.type.startsWith("image/")) {
          data = await apiFetch("/api/v1/uploads/image", { method: "POST", body: formData });
        } else {
          data = await apiFetch("/api/v1/uploads/file", { method: "POST", body: formData });
        }

        const publicUrl = data.url.startsWith("http") ? data.url : `${API_BASE}${data.url}`;
        setAttachments((prev) => [
          ...prev,
          {
            id: nanoid(6),
            name: data.name ?? file.name,
            url: publicUrl,
            size: data.size ?? file.size,
            mimeType: data.mimeType ?? file.type,
            uploadedAt: new Date().toISOString(),
          },
        ]);
        toast.success(`Uploaded ${file.name}`);
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      } finally {
        setUploading(false);
      }
    },
    [user],
  );

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) {
      setNameError("Name is required");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        featureType,
        status,
        priority,
        assignee: assignee.trim() || null,
        targetDate: targetDate || null,
        tags,
        description,
        links,
        attachments,
      });
      onClose();
    } catch {
      toast.error("Failed to save feature");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-[var(--shadow-elevated)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">
            {mode === "create" ? "Create feature" : `Edit: ${feature?.name ?? "Feature"}`}
          </h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5 gap-5">
          {/* Name */}
          <div>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setNameError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Feature name…"
              className={`w-full rounded-lg border bg-background px-3 py-2 text-xl font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring ${nameError ? "border-destructive" : "border-border"}`}
            />
            {nameError && <p className="mt-1 text-xs text-destructive">{nameError}</p>}
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-2">
            <FieldSelect
              label="Type"
              value={featureType}
              onChange={(v) => setFeatureType(v as FeatureType)}
              options={FEATURE_TYPES}
            />
            <FieldSelect
              label="Status"
              value={status}
              onChange={(v) => setStatus(v as Status)}
              options={STATUSES}
            />
            <FieldSelect
              label="Priority"
              value={priority}
              onChange={(v) => setPriority(v as Priority)}
              options={PRIORITIES}
            />
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5">
              <span className="text-xs text-muted-foreground">Assignee</span>
              <input
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                placeholder="Unassigned"
                className="w-28 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5">
              <span className="text-xs text-muted-foreground">Due</span>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-transparent text-xs outline-none"
              />
            </div>
          </div>

          {/* Tags row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="group inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground"
              >
                {t}
                <button
                  type="button"
                  onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                  className="cursor-pointer opacity-60 hover:opacity-100"
                  aria-label={`Remove tag ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
              placeholder="+ tag"
              className="w-20 rounded-md border border-dashed border-border bg-transparent px-2 py-0.5 text-xs outline-none focus:border-solid focus:border-ring"
            />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border -mx-6 px-6 gap-0">
            {(
              [
                ["details", "Details"],
                ["links", `Links${links.length ? ` · ${links.length}` : ""}`],
                ["files", `Files${attachments.length ? ` · ${attachments.length}` : ""}`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`relative px-3 py-2 text-sm transition-colors ${
                  tab === k
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                {tab === k && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>

          {/* ── Tab: Details ────────────────────────────────────────────── */}
          {tab === "details" && (
            <div className="space-y-3">
              {/* Template picker */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Layout className="h-3.5 w-3.5" /> Template:
                </span>
                {Object.entries(TEMPLATES).map(([key, tpl]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyTemplate(key)}
                    className="cursor-pointer rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>

              <MarkdownEditor
                value={description}
                onChange={setDescription}
                placeholder="Describe this feature… (supports Markdown, GFM tables, checklists, images)"
                minHeight={280}
              />
            </div>
          )}

          {/* ── Tab: Links ──────────────────────────────────────────────── */}
          {tab === "links" && (
            <div className="space-y-4">
              {/* Add link form */}
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Add external link
                </p>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    placeholder="Label (e.g. Figma Design)"
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <input
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addLink()}
                    placeholder="https://..."
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                  <select
                    value={linkType}
                    onChange={(e) => setLinkType(e.target.value as LinkType)}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {LINK_TYPES.map((lt) => (
                      <option key={lt.value} value={lt.value}>
                        {lt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={addLink}
                  disabled={!linkUrl.trim()}
                  className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add link
                </button>
              </div>

              {/* Links list */}
              {links.length > 0 ? (
                <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {links.map((link) => (
                    <li
                      key={link.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
                    >
                      <span className="text-base" aria-hidden>
                        {LINK_TYPE_ICON[link.type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{link.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{link.url}</div>
                      </div>
                      <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground shrink-0">
                        {LINK_TYPES.find((lt) => lt.value === link.type)?.label ?? link.type}
                      </span>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Open link"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeLink(link.id)}
                        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Remove link"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<Link2 className="h-8 w-8" />}
                  text="No links yet"
                  sub="Add references, design specs, API docs, or any relevant URLs."
                />
              )}
            </div>
          )}

          {/* ── Tab: Files ──────────────────────────────────────────────── */}
          {tab === "files" && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  handleFiles(e.dataTransfer.files);
                }}
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-muted/20 text-muted-foreground hover:border-primary/50 hover:bg-muted/40"
                }`}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Uploading…</p>
                  </>
                ) : (
                  <>
                    <Paperclip className="h-8 w-8" />
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        {dragOver ? "Drop to upload" : "Drop files here or click to browse"}
                      </p>
                      <p className="mt-0.5 text-xs">Images, PDFs, documents — up to 10 MB each</p>
                    </div>
                  </>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              {/* Attachment list */}
              {attachments.length > 0 ? (
                <ul className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {attachments.map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
                    >
                      <AttachmentIcon mimeType={att.mimeType} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{att.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatBytes(att.size)}
                        </div>
                      </div>
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Open file"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Remove file"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                !uploading && (
                  <EmptyState
                    icon={<FileText className="h-8 w-8" />}
                    text="No files attached"
                    sub="Upload images, PDFs, spreadsheets, or any supporting documents."
                  />
                )
              )}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/20 px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {links.length > 0 && `${links.length} link${links.length > 1 ? "s" : ""}`}
            {links.length > 0 && attachments.length > 0 && " · "}
            {attachments.length > 0 &&
              `${attachments.length} file${attachments.length > 1 ? "s" : ""}`}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm transition-all hover:bg-muted active:scale-[0.97] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  {mode === "create" ? "Create feature" : "Save changes"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-4 text-xs font-medium outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-muted-foreground" />
    </div>
  );
}

function AttachmentIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 shrink-0 text-blue-500" />;
  if (mimeType === "application/pdf") return <FileText className="h-4 w-4 shrink-0 text-red-500" />;
  return <File className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function EmptyState({
  icon,
  text,
  sub,
}: {
  icon: React.ReactNode;
  text: string;
  sub: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
      <span className="opacity-40">{icon}</span>
      <p className="text-sm font-medium">{text}</p>
      <p className="text-xs">{sub}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
