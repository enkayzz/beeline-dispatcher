import { clock, minutes } from "../api";
import {
  locked,
  ticketStatus,
  statusNames,
  type Workspace,
} from "../domain/workspace";
export default function TeamTimeline({
  w,
  engineerId,
  onSelect,
}: {
  w: Workspace;
  engineerId?: string;
  onSelect: (id: string) => void;
}) {
  const routes =
    w.current?.routes.filter(
      (r) => !engineerId || r.engineerId === engineerId,
    ) ?? [];
  const from =
    Math.floor(
      Math.min(540, ...w.data.engineers.map((e) => minutes(e.shift[0]))) / 60,
    ) * 60;
  const to =
    Math.ceil(
      Math.max(1080, ...w.data.engineers.map((e) => minutes(e.shift[1]))) / 60,
    ) * 60;
  const hours = Array.from(
    { length: (to - from) / 60 + 1 },
    (_, i) => from + i * 60,
  );
  const x = (time: number) => `${((time - from) / (to - from)) * 100}%`;
  return (
    <div
      className="team-timeline"
      aria-label="Расписание сотрудников по времени"
    >
      <div className="timeline-inner">
        <div className="timeline-header">
          <b>Сотрудник</b>
          <div className="timeline-axis">
            {hours.map((t) => (
              <time key={t} style={{ left: x(t) }}>
                {clock(t)}
              </time>
            ))}
          </div>
        </div>
        {routes.map((r) => {
          const e = w.data.engineers.find((e) => e.id === r.engineerId)!;
          return (
            <div className="timeline-row" key={e.id}>
              <div className="timeline-person">
                <b>{e.name}</b>
                <small>
                  {r.stops.length} заявок · {r.km.toFixed(1)} км
                </small>
              </div>
              <div className="timeline-track">
                {hours.map((t) => (
                  <i
                    className="timeline-gridline"
                    key={t}
                    style={{ left: x(t) }}
                  />
                ))}
                {!r.stops.length && (
                  <span className="timeline-free">Свободная смена</span>
                )}
                {r.stops.map((s) => {
                  const j = w.data.jobs.find((j) => j.id === s.jobId)!;
                  const emergency = w.tickets[j.id].workType === "emergency";
                  return (
                    <button
                      key={s.jobId}
                      className={`timeline-job ${emergency ? "emergency-card" : ""} ${ticketStatus(w, j) === "completed" ? "timeline-completed" : ""}`}
                      style={{
                        left: x(s.start),
                        width: `${((s.end - s.start) / (to - from)) * 100}%`,
                        borderLeftColor: emergency ? "#c52828" : e.color,
                      }}
                      onClick={() => onSelect(j.id)}
                      aria-label={`Заявка ${j.id}, ${clock(s.start)}–${clock(s.end)}${emergency ? ", авария" : ""}`}
                      title={`${j.title} · ${clock(s.start)}–${clock(s.end)} · ${statusNames[ticketStatus(w, j)]}`}
                    >
                      <strong>
                        {emergency ? "⚠ " : ""}
                        {clock(s.start)}
                        {locked(w.tickets[j.id].status) ? " · ▣" : ""}
                      </strong>
                      <span>{j.title}</span>
                      <small>№ {j.id}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
