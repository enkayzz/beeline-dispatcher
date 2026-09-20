import { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Plus,
  ArrowUpRight,
  ClipboardList,
} from "lucide-react";
import { skillNames } from "../types";
import {
  ticketStatus,
  workNames,
  ownerNames,
  statusNames,
  type Role,
  type Workspace,
} from "../domain/workspace";
import { Badge, Empty, Metric } from "../components/ui";
import { assignmentFor } from "../domain/workspace";
import { clock } from "../api";
export default function Requests({
  workspace: w,
  role,
  onSelect,
  onCreate,
}: {
  workspace: Workspace;
  role: Role;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState(""),
    [type, setType] = useState(""),
    [owner, setOwner] = useState(role === "support" ? "mine" : "all"),
    [date, setDate] = useState(w.data.date),
    [expanded, setExpanded] = useState(false),
    [engineer, setEngineer] = useState("");
  const owned = w.data.jobs.filter(
    (j) =>
      role !== "support" ||
      owner === "all" ||
      w.tickets[j.id].owner === "support-1",
  );
  const attention = new Set(w.current?.unassigned.map((u) => u.jobId));
  const filtered = owned.filter(
    (j) =>
      date === w.data.date &&
      (!query ||
        `${j.id} ${j.title} ${j.address} ${w.tickets[j.id].contact}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!status ||
        (status === "attention"
          ? attention.has(j.id)
          : ticketStatus(w, j) === status)) &&
      (!type || w.tickets[j.id].workType === type) &&
      (!engineer || assignmentFor(w.current, j.id)?.engineerId === engineer),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {role === "support"
              ? "Рабочее место поддержки"
              : "Рабочее место диспетчера"}
          </div>
          <h1>Заявки</h1>
          <p>От первого обращения до выполненной работы.</p>
        </div>
        <button className="primary" onClick={onCreate}>
          <Plus size={16} />
          Создать заявку
        </button>
      </div>
      <section className="card day-summary">
        <div className="day-label">
          <span className="square-icon">
            <ClipboardList size={22} />
          </span>
          <div>
            <h2>
              {new Date(w.data.date + "T12:00").toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                weekday: "long",
              })}
            </h2>
            <p>{w.data.name} · московское время</p>
          </div>
          <span className="badge neutral">Рабочий день</span>
        </div>
        <div className="metrics">
          <Metric
            label={
              owner === "mine" && role === "support"
                ? "Мои заявки"
                : "Всего заявок"
            }
            value={owned.length}
          />
          <Metric
            label="В работе / в пути"
            value={
              owned.filter((j) =>
                ["enroute", "in_progress", "review"].includes(
                  ticketStatus(w, j),
                ),
              ).length
            }
          />
          <Metric
            label="Завершено"
            value={
              owned.filter((j) => ticketStatus(w, j) === "completed").length
            }
          />
          <Metric
            label="Требуют внимания"
            value={owned.filter((j) => attention.has(j.id)).length}
          />
        </div>
      </section>
      <section className="card">
        <div className="card-tabs">
          <button
            className={!status ? "selected" : ""}
            onClick={() => setStatus("")}
          >
            Все заявки <span>{owned.length}</span>
          </button>
          <button
            className={status === "new" ? "selected" : ""}
            onClick={() => setStatus("new")}
          >
            Новые
          </button>
          <button
            className={status === "attention" ? "selected" : ""}
            onClick={() => setStatus("attention")}
          >
            Требуют внимания{" "}
            <span>{owned.filter((j) => attention.has(j.id)).length}</span>
          </button>
          <button
            className={status === "completed" ? "selected" : ""}
            onClick={() => setStatus("completed")}
          >
            Завершённые
          </button>
        </div>
        <div className="filterbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Поиск заявок"
              placeholder="Поиск по номеру, адресу или клиенту"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            <SlidersHorizontal size={16} />
            Фильтры
          </button>
          {role === "support" && (
            <select
              aria-label="Владелец заявок"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            >
              <option value="mine">Мои заявки</option>
              <option value="all">Все обращения</option>
            </select>
          )}
        </div>
        {expanded && (
          <div className="filter-details">
            <label>
              Дата
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Статус
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Все статусы</option>
                {Object.entries(statusNames).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
                <option value="attention">Требуют внимания</option>
              </select>
            </label>
            <label>
              Тип работ
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">Все типы</option>
                {Object.entries(workNames).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Инженер
              <select
                value={engineer}
                onChange={(e) => setEngineer(e.target.value)}
              >
                <option value="">Все инженеры</option>
                {w.data.engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => {
                setQuery("");
                setStatus("");
                setType("");
                setDate(w.data.date);
                setEngineer("");
              }}
            >
              Сбросить
            </button>
          </div>
        )}
        {filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Заявка</th>
                  <th>Статус</th>
                  <th>Тип и приоритет</th>
                  <th>Окно клиента</th>
                  <th>Инженер</th>
                  <th>Выполнение</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => {
                  const info = w.tickets[j.id],
                    a = assignmentFor(w.current, j.id);
                  return (
                    <tr key={j.id}>
                      <td>
                        <button
                          className="text-button ticket-link"
                          onClick={() => onSelect(j.id)}
                        >
                          <b>№ {j.id}</b>
                          <span>{j.title}</span>
                        </button>
                        <small>{j.address}</small>
                      </td>
                      <td>
                        <Badge status={ticketStatus(w, j)} />
                        {attention.has(j.id) && (
                          <small className="attention-text">
                            Нужно назначить
                          </small>
                        )}
                      </td>
                      <td>
                        {workNames[info.workType]}
                        {info.workType === "emergency" && (
                          <small className="critical-text">
                            Высокий приоритет
                          </small>
                        )}
                        <small title={skillNames[j.skill]}>
                          {ownerNames[info.owner] || info.owner}
                        </small>
                      </td>
                      <td className="nowrap">
                        {j.window.join("–")}
                        <small>
                          {a
                            ? `Начало ${clock(a.stop.start)}`
                            : "Время не назначено"}
                        </small>
                      </td>
                      <td>
                        {a ? (
                          w.data.engineers.find((e) => e.id === a.engineerId)
                            ?.name
                        ) : (
                          <span className="muted">Не назначен</span>
                        )}
                      </td>
                      <td>
                        <div className="progress-cell">
                          <progress value={info.progress} max={100} />
                          <span>{info.progress}%</span>
                        </div>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Открыть заявку ${j.id}`}
                          onClick={() => onSelect(j.id)}
                        >
                          <ArrowUpRight size={17} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Заявки не найдены">
            Измените фильтры или создайте новое обращение.
          </Empty>
        )}
        <div className="table-footer">
          Показано {filtered.length} из {owned.length} ·{" "}
          {role === "support"
            ? "Ваши обращения и статусы исполнения"
            : "Все обращения рабочего дня"}
        </div>
      </section>
    </>
  );
}
