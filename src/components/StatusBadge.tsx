import type { Status, Priority } from "@/lib/types";
import { labelStatus, labelPriority } from "@/lib/store";
import { cn } from "@/lib/utils";

const statusStyles: Record<Status, string> = {
  todo: "bg-status-todo/10 text-status-todo border-status-todo/20",
  in_progress: "bg-status-progress/15 text-status-progress border-status-progress/30",
  done: "bg-status-done/15 text-status-done border-status-done/30",
  deprecated: "bg-status-deprecated/10 text-status-deprecated border-status-deprecated/30",
};

const priorityStyles: Record<Priority, string> = {
  low: "bg-priority-low/10 text-priority-low border-priority-low/20",
  medium: "bg-priority-medium/15 text-priority-medium border-priority-medium/30",
  high: "bg-priority-high/15 text-priority-high border-priority-high/30",
  critical: "bg-priority-critical/15 text-priority-critical border-priority-critical/30",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        statusStyles[status],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {labelStatus(status)}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        priorityStyles[priority],
        className
      )}
    >
      {labelPriority(priority)}
    </span>
  );
}
