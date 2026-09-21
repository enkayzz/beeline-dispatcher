import { assignmentFor, type Workspace } from "../domain/workspace";
import { clock } from "../api";
import { Empty, fmt } from "../components/ui";
export default function Efficiency({
  w,
  onSelect,
}: {
  w: Workspace;
  onSelect: (id: string) => void;
}) {
  const { current, optimized, baseline } = w;
  if (!current || !optimized || !baseline)
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Эффективность</h1>
            <p>Сравнение решений на одинаковых данных.</p>
          </div>
        </div>
        <section className="card">
          <Empty title="Сначала постройте план">
            После распределения здесь появятся метрики и отклонения ручного
            расписания.
          </Empty>
        </section>
      </>
    );
  const rows = [
    ["Назначено заявок", "assigned", ""],
    ["Задействовано специалистов", "engineers", ""],
    ["Пробег", "km", " км"],
    ["Время в пути", "travel", " мин"],
  ] as const;
  const changed = w.data.jobs.filter((j) => {
    const a = assignmentFor(current, j.id),
      b = assignmentFor(optimized, j.id);
    return a?.engineerId !== b?.engineerId || a?.stop.start !== b?.stop.start;
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Результат распределения</div>
          <h1>Эффективность</h1>
          <p>Базовый алгоритм, предложение системы и ваш рабочий план.</p>
        </div>
        <span className="badge neutral">
          {Object.keys(w.manual).length} ручных назначений
        </span>
      </div>
      <section className="card">
        <div className="section-title padded">
          <h2>Отклонение от оптимизированного плана</h2>
        </div>
        <div className="table-scroll">
          <table className="comparison">
            <thead>
              <tr>
                <th>Показатель</th>
                <th>Базовый</th>
                <th>Оптимизированный</th>
                <th>Рабочий план</th>
                <th>Отклонение</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, key, unit]) => {
                const delta = current.metrics[key] - optimized.metrics[key];
                return (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>
                      {fmt(baseline.metrics[key])}
                      {unit}
                    </td>
                    <td>
                      {fmt(optimized.metrics[key])}
                      {unit}
                    </td>
                    <td>
                      <b>
                        {fmt(current.metrics[key])}
                        {unit}
                      </b>
                    </td>
                    <td>
                      <span
                        className={`badge ${delta === 0 ? "neutral" : (key === "assigned" ? delta > 0 : delta < 0) ? "status-completed" : "status-review"}`}
                      >
                        {delta > 0 ? "+" : ""}
                        {fmt(delta)}
                        {unit}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="padded muted">
          Сравниваются одни и те же заявки, ресурсы и фактические статусы.
          Предложение системы пересчитывается без ручных фиксаций. Это
          эвристика, а не доказанный математический оптимум.
        </p>
      </section>
      <section className="card">
        <div className="section-title padded">
          <h2>Изменения относительно предложения</h2>
          <span className="badge neutral">{changed.length}</span>
        </div>
        {changed.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Заявка</th>
                  <th>Предложение системы</th>
                  <th>Рабочий план</th>
                  <th>Изменение начала</th>
                </tr>
              </thead>
              <tbody>
                {changed.map((j) => {
                  const a = assignmentFor(current, j.id),
                    b = assignmentFor(optimized, j.id);
                  const label = (x: typeof a) =>
                    x
                      ? `${w.data.engineers.find((e) => e.id === x.engineerId)?.name} · ${clock(x.stop.start)}`
                      : "Не назначена";
                  return (
                    <tr key={j.id}>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => onSelect(j.id)}
                        >
                          № {j.id} · {j.title}
                        </button>
                      </td>
                      <td>{label(b)}</td>
                      <td>{label(a)}</td>
                      <td>
                        {a && b
                          ? `${a.stop.start - b.stop.start > 0 ? "+" : ""}${a.stop.start - b.stop.start} мин`
                          : "Изменён статус назначения"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="План соответствует предложению">
            После ручной корректировки здесь будут видны изменения исполнителей,
            времени и назначений.
          </Empty>
        )}
      </section>
    </>
  );
}
