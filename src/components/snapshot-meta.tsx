import { Icon } from "./ui-icon";

export function SnapshotMeta({ date }: { date: string }) {
  const label = date ? new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi",
  }).format(new Date(`${date}T00:00:00Z`)) : "Not available";

  return (
    <div className="snapshot-meta">
      <span className="snapshot-icon"><Icon name="calendar" /></span>
      <div><span className="stat-label">Latest snapshot</span><time dateTime={date || undefined}>{label}</time></div>
      <span className="source-badge">PSX data</span>
    </div>
  );
}
