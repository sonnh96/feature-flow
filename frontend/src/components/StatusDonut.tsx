import type { Status } from "@/lib/types";

interface Props {
  data: Record<Status, number>;
  size?: number;
}

const colors: Record<Status, string> = {
  todo: "var(--status-todo)",
  in_progress: "var(--status-progress)",
  done: "var(--status-done)",
  deprecated: "var(--status-deprecated)",
};

const labels: Record<Status, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  deprecated: "Deprecated",
};

export function StatusDonut({ data, size = 160 }: Props) {
  const entries = (Object.keys(data) as Status[]).map((k) => ({ key: k, value: data[k] }));
  const total = entries.reduce((s, e) => s + e.value, 0);
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={14}
        />
        {total > 0 &&
          entries.map((e) => {
            const len = (e.value / total) * circumference;
            const seg = (
              <circle
                key={e.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={colors[e.key]}
                strokeWidth={14}
                strokeDasharray={`${len} ${circumference - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return seg;
          })}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="rotate-90 fill-foreground text-xl font-semibold"
          style={{ transformOrigin: "center" }}
        >
          {total}
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {entries.map((e) => (
          <li key={e.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors[e.key] }} />
            <span className="text-muted-foreground">{labels[e.key]}</span>
            <span className="font-medium tabular-nums">{e.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
