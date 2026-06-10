import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  FileText,
  FolderUp,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import type { FeatureImportResponse } from "@/lib/types";

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onImported: (result: FeatureImportResponse) => void;
}

const ACCEPTED_TYPES = ".zip,.md,.markdown,.txt";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isSupported(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".zip") ||
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    name.endsWith(".txt")
  );
}

export function FeatureImportModal({ projectId, open, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [skipExisting, setSkipExisting] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<FeatureImportResponse | null>(null);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const hasZip = files.some((file) => file.name.toLowerCase().endsWith(".zip"));

  const addFiles = (incoming: FileList | File[]) => {
    const supported = Array.from(incoming).filter(isSupported);
    if (!supported.length) {
      toast.error("Upload a ZIP, Markdown, or text SRS file");
      return;
    }
    setResult(null);
    setFiles((current) => {
      const byKey = new Map(
        current.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]),
      );
      for (const file of supported)
        byKey.set(`${file.name}:${file.size}:${file.lastModified}`, file);
      return Array.from(byKey.values());
    });
  };

  const removeFile = (fileToRemove: File) => {
    setFiles((current) => current.filter((file) => file !== fileToRemove));
    setResult(null);
  };

  const resetAndClose = () => {
    if (importing) return;
    setFiles([]);
    setResult(null);
    setDragOver(false);
    onClose();
  };

  const submit = async () => {
    if (!files.length || importing) return;
    setImporting(true);
    try {
      const formData = new FormData();
      for (const file of files)
        formData.append("files", file, file.webkitRelativePath || file.name);
      formData.append("skip_existing", String(skipExisting));
      const data = await apiFetch(`/api/v1/projects/${projectId}/features/import`, {
        method: "POST",
        body: formData,
      });
      const importResult = data as FeatureImportResponse;
      setResult(importResult);
      onImported(importResult);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && resetAndClose()}>
      <DialogContent className="h-[min(760px,calc(100dvh-2rem))] max-w-[min(920px,calc(100vw-2rem))] gap-0 overflow-hidden p-0 [display:flex] flex-col">
        <DialogHeader className="shrink-0 border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <FolderUp className="h-5 w-5 text-primary" />
            Import SRS features
          </DialogTitle>
          <DialogDescription>
            Upload a ZIP or selected SRS files. Folder paths become parent features; documents
            become child features.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              addFiles(event.dataTransfer.files);
            }}
            className={`flex min-h-[160px] flex-col items-center justify-center rounded-lg border border-dashed px-5 py-6 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"
            }`}
          >
            <div className="grid h-11 w-11 place-items-center rounded-full bg-background shadow-sm">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div className="mt-3 text-sm font-medium">Drop SRS ZIP or files here</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Supports .zip, .md, .markdown, and .txt
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <FileText className="h-4 w-4" />
                Choose files
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderUp className="h-4 w-4" />
                Choose folder
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              multiple
              className="hidden"
              {...{ webkitdirectory: "", directory: "" }}
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
            <div>
              <div className="text-sm font-medium">Skip existing features</div>
              <div className="text-xs text-muted-foreground">
                Match by feature name under the same parent.
              </div>
            </div>
            <Switch checked={skipExisting} onCheckedChange={setSkipExisting} />
          </div>

          {files.length > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="text-sm font-medium">
                  {files.length} file{files.length === 1 ? "" : "s"} selected
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatSize(totalSize)}
                  {hasZip ? " · ZIP import" : ""}
                </div>
              </div>
              <div className="max-h-[min(18rem,32dvh)] overflow-y-auto p-2">
                {files.map((file) => (
                  <div
                    key={`${file.name}:${file.size}:${file.lastModified}`}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50"
                  >
                    <Archive className="h-4 w-4 text-muted-foreground" />
                    <span className="min-w-0 truncate" title={file.webkitRelativePath || file.name}>
                      {file.webkitRelativePath || file.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatSize(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(file)}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="grid gap-3 rounded-lg border border-status-done/30 bg-status-done/5 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium text-status-done">
                <CheckCircle2 className="h-4 w-4" />
                Import complete
              </div>
              <div className="grid grid-cols-3 gap-3">
                <ResultStat label="Documents" value={result.total_documents} />
                <ResultStat label="Created" value={result.created_count} />
                <ResultStat label="Skipped" value={result.skipped_count} />
              </div>
            </div>
          )}

          {!files.length && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Browser folder upload support varies. ZIP is the most reliable option for preserving
              nested SRS folders.
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
          <Button type="button" variant="outline" onClick={resetAndClose} disabled={importing}>
            Close
          </Button>
          <Button type="button" onClick={submit} disabled={!files.length || importing}>
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderUp className="h-4 w-4" />
            )}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-background px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
