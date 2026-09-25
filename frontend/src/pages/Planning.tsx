import { useState } from "react";
import {
  Map,
  CalendarDays,
  WandSparkles,
  AlertCircle,
  ArrowRight,
  Zap,
} from "lucide-react";
import type { Workspace } from "../domain/workspace";
import TeamTimeline from "../components/TeamTimeline";
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
            Распределить все заявки
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
              Исправьте условия в карточке заявки, затем назначьте специалиста
              поддержки. Остальное расписание пересчитается.
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
          <TeamTimeline w={w} engineerId={engineer} onSelect={onSelect} />
        )}
      </section>
      <p className="footnote">
        Время Москвы · Расстояния по прямой, скорости усреднены · Завершённые
        работы остаются в истории дня
      </p>
    </>
  );
}
