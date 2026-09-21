import { useState } from "react";
import {
  Map,
  CalendarDays,
  WandSparkles,
  AlertCircle,
  LockKeyhole,
  ArrowRight,
  Zap,
} from "lucide-react";
import type { Workspace } from "../domain/workspace";
import { locked } from "../domain/workspace";
import { clock } from "../api";
import MapView from "../MapView";
import { Empty, Metric, fmt } from "../components/ui";
export default function Planning({
  w,
  onPlan,
  onSelect,
  onUrgent,
}: {
  w: Workspace;
  onPlan: () => void;
  onSelect: (id: string) => void;
  onUrgent: () => void;
}) {
  const [view, setView] = useState<"schedule" | "map">("schedule"),
    [engineer, setEngineer] = useState("");
  const plan = w.current;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Управление рабочим днём</div>
          <h1>Маршруты и расписание</h1>
          <p>Система предлагает план. Последнее решение — за диспетчером.</p>
        </div>
        <div className="actions">
          <button onClick={onUrgent}>
            <Zap size={16} />
            Срочная заявка
          </button>
          <button className="primary" onClick={onPlan}>
            <WandSparkles size={16} />
            {plan ? "Пересчитать план" : "Построить план"}
          </button>
        </div>
      </div>
      <div className="card metrics">
        <Metric
          label="Назначено"
          value={`${plan?.metrics.assigned ?? 0} / ${w.data.jobs.filter((j) => w.tickets[j.id].status !== "cancelled").length}`}
        />
        <Metric
          label="Специалистов на маршруте"
          value={plan?.metrics.engineers ?? "—"}
        />
        <Metric
          label="Пробег, оценка"
          value={plan ? `${fmt(plan.metrics.km)} км` : "—"}
        />
        <Metric
          label="Ручных назначений"
          value={Object.keys(w.manual).length}
        />
      </div>
      {plan?.unassigned.length ? (
        <div className="banner warning">
          <AlertCircle size={20} />
          <div>
            <strong>Требуют внимания: {plan.unassigned.length}</strong>
            <p>
              Исправьте условия в карточке заявки, затем назначьте специалиста поддержки.
              Остальное расписание пересчитается.
            </p>
            <div className="actions">
              {plan.unassigned.map((u) => (
                <button key={u.jobId} onClick={() => onSelect(u.jobId)}>
                  № {u.jobId}
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <section className="card">
        <div className="section-toolbar">
          <div className="segmented">
            <button
              className={view === "schedule" ? "active" : ""}
              onClick={() => setView("schedule")}
            >
              <CalendarDays size={16} />
              Расписание
            </button>
            <button
              className={view === "map" ? "active" : ""}
              onClick={() => setView("map")}
            >
              <Map size={16} />
              Карта
            </button>
          </div>
          <select
            aria-label="Фильтр маршрутов"
            value={engineer}
            onChange={(e) => setEngineer(e.target.value)}
          >
            <option value="">Все специалисты поддержки</option>
            {w.data.engineers.map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        {view === "map" ? (
          <MapView
            data={w.data}
            plan={plan}
            engineerId={engineer || undefined}
            onSelect={onSelect}
          />
        ) : !plan ? (
          <Empty title="Заявки готовы к распределению">
            Постройте план: учитываются навыки, транспорт, оборудование, окна
            клиентов и смены.
          </Empty>
        ) : (
          <div className="schedule">
            {plan.routes
              .filter((r) => !engineer || r.engineerId === engineer)
              .map((r) => {
                const e = w.data.engineers.find((e) => e.id === r.engineerId)!;
                return (
                  <div className="schedule-row" key={e.id}>
                    <div className="engineer-heading">
                      <span className="avatar" style={{ background: e.color }}>
                        {e.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </span>
                      <div>
                        <b>{e.name}</b>
                        <small>
                          {e.shift.join("–")} · {r.stops.length} заявок ·{" "}
                          {fmt(r.km)} км
                        </small>
                      </div>
                    </div>
                    <div className="schedule-stops">
                      {r.stops.length ? (
                        r.stops.map((s, index) => {
                          const j = w.data.jobs.find((j) => j.id === s.jobId)!;
                          return (
                            <button
                              className={`stop-card ${w.manual[j.id] ? "fixed" : ""}`}
                              key={j.id}
                              onClick={() => onSelect(j.id)}
                              style={{ borderLeftColor: e.color }}
                            >
                              <span className="stop-time">
                                {clock(s.start)} — {clock(s.end)}
                                {(w.manual[j.id] ||
                                  locked(w.tickets[j.id].status)) && (
                                  <LockKeyhole size={12} />
                                )}
                              </span>
                              <b>{j.title}</b>
                              <small>
                                № {j.id} · {s.travel} мин в пути
                              </small>
                              <span className="stop-number">{index + 1}</span>
                            </button>
                          );
                        })
                      ) : (
                        <span className="muted">Свободная смена</span>
                      )}
                    </div>
                  </div>
                );
              })}
            <p className="schedule-help">
              Нажмите на работу, чтобы изменить исполнителя или начало. Значок
              замка — фиксированное назначение.
            </p>
          </div>
        )}
      </section>
      <p className="footnote">
        Время Москвы · Расстояния по прямой, скорости усреднены · Завершённые
        работы остаются в истории дня
      </p>
    </>
  );
}
