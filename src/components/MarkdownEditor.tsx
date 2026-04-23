import { useCallback, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Code,
  Code2,
  Link as LinkIcon,
  Quote,
  ImagePlus,
  Eye,
  Pencil,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Mode = "write" | "preview";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function MarkdownEditor({ value, onChange, placeholder, minHeight = 240 }: Props) {
  const { user } = useAuth();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("write");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /** Wrap or insert text around the current selection */
  const surround = (before: string, after = before, placeholderText = "") => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + before.length;
      ta.setSelectionRange(cursor, cursor + selected.length);
    });
  };

  /** Prefix every selected line (or current line) with `prefix` */
  const prefixLines = (prefix: string | ((i: number) => string)) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", end);
    const sliceEnd = lineEnd === -1 ? value.length : lineEnd;
    const block = value.slice(lineStart, sliceEnd);
    const lines = block.split("\n");
    const transformed = lines
      .map((l, i) => (typeof prefix === "string" ? prefix : prefix(i)) + l)
      .join("\n");
    const next = value.slice(0, lineStart) + transformed + value.slice(sliceEnd);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart, lineStart + transformed.length);
    });
  };

  const insertAtCursor = (text: string) => {
    const ta = taRef.current;
    if (!ta) {
      onChange(value + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + text.length;
      ta.setSelectionRange(cursor, cursor);
    });
  };

  const uploadImage = useCallback(
    async (file: File) => {
      if (!user) {
        toast.error("Sign in to upload images");
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are supported");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be under 5 MB");
        return;
      }
      setUploading(true);
      const placeholderText = `![Uploading ${file.name}…]()`;
      insertAtCursor(`\n${placeholderText}\n`);
      try {
        const ext = file.name.split(".").pop() || "png";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage
          .from("feature-images")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from("feature-images").getPublicUrl(path);
        const finalMd = `![${file.name.replace(/\.[^.]+$/, "")}](${data.publicUrl})`;
        // Replace placeholder in latest value snapshot
        onChange(
          (taRef.current?.value ?? value).replace(placeholderText, finalMd)
        );
      } catch (e) {
        console.error(e);
        toast.error("Image upload failed");
        onChange((taRef.current?.value ?? value).replace(placeholderText, ""));
      } finally {
        setUploading(false);
      }
    },
    [user, value, onChange]
  );

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => uploadImage(f));
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const images = items.filter((i) => i.type.startsWith("image/"));
    if (images.length === 0) return;
    e.preventDefault();
    images.forEach((i) => {
      const f = i.getAsFile();
      if (f) uploadImage(f);
    });
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  /** Smart Enter: continue list / checklist / numbered list */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      surround("**", "**", "bold");
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
      e.preventDefault();
      surround("*", "*", "italic");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      const ta = e.currentTarget;
      const pos = ta.selectionStart;
      const lineStart = value.lastIndexOf("\n", pos - 1) + 1;
      const line = value.slice(lineStart, pos);
      const checklist = line.match(/^(\s*)- \[([ xX])\] /);
      const bullet = line.match(/^(\s*)([-*]) /);
      const numbered = line.match(/^(\s*)(\d+)\. /);
      if (checklist) {
        if (line.trim() === `- [${checklist[2]}]`) {
          // empty list item — break out
          e.preventDefault();
          const next = value.slice(0, lineStart) + value.slice(pos);
          onChange(next);
          requestAnimationFrame(() => ta.setSelectionRange(lineStart, lineStart));
          return;
        }
        e.preventDefault();
        insertAtCursor(`\n${checklist[1]}- [ ] `);
        return;
      }
      if (bullet) {
        if (line.trim() === bullet[2]) {
          e.preventDefault();
          const next = value.slice(0, lineStart) + value.slice(pos);
          onChange(next);
          requestAnimationFrame(() => ta.setSelectionRange(lineStart, lineStart));
          return;
        }
        e.preventDefault();
        insertAtCursor(`\n${bullet[1]}${bullet[2]} `);
        return;
      }
      if (numbered) {
        const n = parseInt(numbered[2], 10);
        if (line.trim() === `${n}.`) {
          e.preventDefault();
          const next = value.slice(0, lineStart) + value.slice(pos);
          onChange(next);
          requestAnimationFrame(() => ta.setSelectionRange(lineStart, lineStart));
          return;
        }
        e.preventDefault();
        insertAtCursor(`\n${numbered[1]}${n + 1}. `);
        return;
      }
    }
  };

  return (
    <div className="rounded-md border border-border bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        <ToolBtn title="Bold (⌘B)" onClick={() => surround("**", "**", "bold text")}>
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Italic (⌘I)" onClick={() => surround("*", "*", "italic text")}>
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Heading" onClick={() => prefixLines("## ")}>
          <Heading2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn title="Bullet list" onClick={() => prefixLines("- ")}>
          <List className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Numbered list" onClick={() => prefixLines((i) => `${i + 1}. `)}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Checklist" onClick={() => prefixLines("- [ ] ")}>
          <ListChecks className="h-3.5 w-3.5" />
        </ToolBtn>
        <Divider />
        <ToolBtn title="Inline code" onClick={() => surround("`", "`", "code")}>
          <Code className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title="Code block"
          onClick={() => surround("\n```\n", "\n```\n", "code block")}
        >
          <Code2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Quote" onClick={() => prefixLines("> ")}>
          <Quote className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Link" onClick={() => surround("[", "](https://)", "text")}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title="Upload image"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImagePlus className="h-3.5 w-3.5" />
          )}
        </ToolBtn>

        <div className="ml-auto flex items-center gap-0.5 rounded-md bg-muted p-0.5">
          <ModeBtn active={mode === "write"} onClick={() => setMode("write")}>
            <Pencil className="h-3 w-3" /> Write
          </ModeBtn>
          <ModeBtn active={mode === "preview"} onClick={() => setMode("preview")}>
            <Eye className="h-3 w-3" /> Preview
          </ModeBtn>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {mode === "write" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`relative ${dragOver ? "ring-2 ring-inset ring-primary" : ""}`}
        >
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={placeholder}
            style={{ minHeight }}
            className="w-full resize-y bg-transparent p-3 font-mono text-sm leading-relaxed outline-none"
          />
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-primary/5 text-sm font-medium text-primary">
              Drop image to upload
            </div>
          )}
        </div>
      ) : (
        <div
          style={{ minHeight }}
          className="prose-feature p-4 text-sm leading-relaxed"
        >
          {value.trim() ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: ({ node, ...props }) => (
                  <img
                    {...props}
                    loading="lazy"
                    className="my-2 max-h-96 rounded-md border border-border"
                  />
                ),
                a: ({ node, ...props }) => (
                  <a
                    {...props}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  />
                ),
                input: ({ node, ...props }) =>
                  props.type === "checkbox" ? (
                    <input
                      {...props}
                      disabled={false}
                      readOnly
                      className="mr-1.5 h-3.5 w-3.5 translate-y-[1px] accent-primary"
                    />
                  ) : (
                    <input {...props} />
                  ),
              }}
            >
              {value}
            </ReactMarkdown>
          ) : (
            <p className="text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      )}

      <div className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        Markdown supported · drag, drop, or paste images · ⌘B bold · ⌘I italic
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-border" />;
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
