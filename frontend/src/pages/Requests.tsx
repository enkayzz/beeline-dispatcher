import { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  Plus,
  ClipboardList,
  Clock3,
  MapPin,
  UserRound,
} from "lucide-react";
import {
  assignmentFor,
  ownerNames,
  statusNames,
  ticketStatus,
  workNames,
  personalJobs,
  type Role,
  type Workspace,
} from "../domain/workspace";
import { Badge, Empty, Metric } from "../components/ui";
import { clock } from "../api";

type Stage = "attention" | "waiting" | "enroute" | "working" | "closed";
const stages: { id: Stage; title: string; hint: string }[] = [
  {
    id: "attention",
    title: "Требуют внимания",
    hint: "Нет допустимого назначения",
  },
  {
    id: "waiting",
    title: "Ожидают выезда",
    hint: "Исполнитель и время назначены",
  },
  { id: "enroute", title: "В пути", hint: "Специалист поддержки выехал" },
  { id: "working", title: "В работе", hint: "Работа начата или на проверке" },
  { id: "closed", title: "Закрыты", hint: "Завершены или отменены" },
];

export function requestStage(w: Workspace, jobId: string): Stage {
  const job = w.data.jobs.find((item) => item.id === jobId)!;
  const status = ticketStatus(w, job);
  if (status === "completed" || status === "cancelled") return "closed";
  if (status === "in_progress" || status === "review") return "working";
  if (status === "enroute") return "enroute";
  if (status === "assigned") return "waiting";
  return "attention";
}

export default function Requests({
  workspace: w,
  role,
  onSelect,
  onCreate,
  onPlan,
}: {
  workspace: Workspace;
  role: Role;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onPlan: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [owner, setOwner] = useState(role === "support" ? "mine" : "all");
  const [expanded, setExpanded] = useState(false);
  const [engineer, setEngineer] = useState("");
  const owned =
    role !== "support" || owner === "all"
      ? w.data.jobs
      : owner === "created"
        ? w.data.jobs.filter((job) => w.tickets[job.id].owner === "support-1")
        : personalJobs(w);
  const filtered = owned.filter(
    (job) =>
      (!query ||
        `${job.id} ${job.title} ${job.address} ${w.tickets[job.id].contact}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!status || ticketStatus(w, job) === status) &&
      (!type || w.tickets[job.id].workType === type) &&
      (!engineer || assignmentFor(w.current, job.id)?.engineerId === engineer),
  );
  const count = (stage: Stage) =>
    filtered.filter((job) => requestStage(w, job.id) === stage).length;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {role === "support"
              ? "Рабочее место поддержки"
              : "Диспетчерская доска"}
          </div>
          <h1>Заявки</h1>
          <p>
            Карточки переходят между этапами автоматически после назначения и
            изменения фактического статуса.
          </p>
        </div>
        <div className="actions">
          {role === "dispatcher" && (
            <button className="primary" onClick={onPlan}>
              Распределить все заявки
            </button>
          )}
          <button onClick={onCreate}>
            <Plus size={16} /> Создать заявку
          </button>
        </div>
      </div>

      <section className="card day-summary compact-summary">
        <div className="day-label">
          <span className="square-icon">
            <ClipboardList size={22} />
          </span>
          <div>
            <h2>
              {new Date(`${w.data.date}T12:00`).toLocaleDateString("ru-RU", {
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
          <Metric label="Заявок по фильтру" value={filtered.length} />
          <Metric label="Требуют внимания" value={count("attention")} />
          <Metric
            label="В пути / работе"
            value={count("enroute") + count("working")}
          />
          <Metric label="Закрыто" value={count("closed")} />
        </div>
      </section>

      <section className="card request-controls">
        <div className="filterbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Поиск заявок"
              placeholder="Номер, адрес, клиент или название"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            <SlidersHorizontal size={16} /> Фильтры
          </button>
          {role === "support" && (
            <select
              aria-label="Владелец заявок"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            >
              <option value="mine">Назначенные мне</option>
              <option value="created">Созданные мной обращения</option>
              <option value="all">Все обращения</option>
            </select>
          )}
        </div>
        {expanded && (
          <div className="filter-details">
            <label>
              Фактический статус
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">Все статусы</option>
                {Object.entries(statusNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип работ
              <select
                aria-label="Тип работ"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="">Все типы</option>
                {Object.entries(workNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Специалист поддержки
              <select
                value={engineer}
                onChange={(event) => setEngineer(event.target.value)}
              >
                <option value="">Все специалисты</option>
                {w.data.engineers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => {
                setQuery("");
                setStatus("");
                setType("");
                setEngineer("");
              }}
            >
              Сбросить
            </button>
          </div>
        )}
      </section>

      {filtered.length ? (
        <div className="kanban" aria-label="Этапы заявок">
          {stages.map((stage) => {
            const jobs = filtered.filter(
              (job) => requestStage(w, job.id) === stage.id,
            );
            return (
              <section
                className={`kanban-column stage-${stage.id}`}
                key={stage.id}
              >
                <header>
                  <div>
                    <h2>{stage.title}</h2>
                    <span>{jobs.length}</span>
                  </div>
                  <p>{stage.hint}</p>
                </header>
                <div className="kanban-cards">
                  {jobs.length ? (
                    jobs.map((job) => {
                      const info = w.tickets[job.id];
                      const assignment =
                        assignmentFor(w.current, job.id) ?? info.lastAssignment;
                      const assignedEngineer = w.data.engineers.find(
                        (item) => item.id === assignment?.engineerId,
                      );
                      const reason = w.current?.unassigned.find(
                        (item) => item.jobId === job.id,
                      )?.reason;
                      return (
                        <button
                          className={`kanban-card ${info.workType === "emergency" ? "emergency-card" : ""}`}
                          key={job.id}
                          aria-label={`Открыть заявку ${job.id}`}
                          onClick={() => onSelect(job.id)}
                        >
                          <div className="kanban-card-top">
                            <span>№ {job.id}</span>
                            <Badge status={ticketStatus(w, job)} />
                          </div>
                          <h3>
                            {info.workType === "emergency" && (
                              <span className="emergency-label">Авария · </span>
                            )}
                            {job.title}
                          </h3>
                          <p>
                            <MapPin size={13} /> {job.address}
                          </p>
                          <dl>
                            <div>
                              <dt>
                                <Clock3 size={12} /> Окно
                              </dt>
                              <dd>{job.window.join("–")}</dd>
                            </div>
                            <div>
                              <dt>
                                <UserRound size={12} /> Исполнитель
                              </dt>
                              <dd>{assignedEngineer?.name ?? "Не назначен"}</dd>
                            </div>
                          </dl>
                          {assignment && (
                            <div className="card-assignment">
                              Начало работ в {clock(assignment.stop.start)}
                            </div>
                          )}
                          {reason && (
                            <div className="card-reason">{reason}</div>
                          )}
                          <footer>
                            <span>{workNames[info.workType]}</span>
                            <span>{ownerNames[info.owner] || info.owner}</span>
                          </footer>
                        </button>
                      );
                    })
                  ) : (
                    <div className="kanban-empty">Нет заявок</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="card">
          <Empty title="Заявки не найдены">
            Измените фильтры или создайте новое обращение.
          </Empty>
        </section>
      )}
      <p className="kanban-footnote">
        {role === "support" &&
          "«Назначенные мне» — те же работы, что в личном расписании за выбранный день, включая закрытые. Счётчик меню показывает их количество без фильтров. "}
        Этапы не перетаскиваются вручную: назначение переводит заявку в ожидание
        выезда, поддержка отмечает путь и работу, диспетчер подтверждает
        закрытие.
      </p>
    </>
  );
}
