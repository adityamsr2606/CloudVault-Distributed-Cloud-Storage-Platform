import { Activity } from "lucide-react";
import { useEffect, useState } from "react";

import { ActivityEvent, listActivity } from "../lib/cloudvault";

const labels: Record<string, string> = {
  file_uploaded: "Uploaded",
  file_deleted: "Moved to trash",
  file_restored: "Restored",
  file_versioned: "New version",
  file_starred: "Starred",
  file_unstarred: "Unstarred",
};

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void listActivity().then(setEvents).catch((error) => setMessage(error instanceof Error ? error.message : "Could not load activity"));
  }, []);

  return (
    <div className="page-wrap">
      <header className="page-header"><div><p className="eyebrow">Audit trail</p><h1>Activity</h1><p>System-generated file lifecycle events from the database.</p></div><div className="ai-badge"><Activity size={16}/> immutable events</div></header>
      {message && <div className="inline-message">{message}</div>}
      <section className="timeline glass-panel">
        {events.map((event) => (
          <div className="timeline-item" key={event.id}>
            <span className="timeline-dot" />
            <div><strong>{labels[event.event_type] ?? event.event_type}</strong><p>{String(event.detail?.name ?? "File")}</p></div>
            <time>{new Date(event.created_at).toLocaleString()}</time>
          </div>
        ))}
        {events.length === 0 && <div className="empty-state">No activity yet.</div>}
      </section>
    </div>
  );
}
