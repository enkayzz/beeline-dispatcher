import { useEffect, useState } from "react";
import {
  ClipboardList,
  Route,
  ChartNoAxesCombined,
  Users,
  Headset,
  ChevronDown,
  Menu,
  Upload,
  Download,
  RotateCcw,
  CheckCircle2,
  CircleHelp,
  X,
  Settings2,
} from "lucide-react";
import type { Job, Skill } from "./types";
import { skillNames, transportNames } from "./types";
import { parseDataset } from "./validation";
import {
  audit,
  assignmentFor,
  createWorkspace,
  loadWorkspace,
  locked,
  STORAGE_KEY,
  ticketStatus,
  type Assignment,
  type Role,
  type Status,
  type TicketInfo,
  type Workspace,
} from "./domain/workspace";
import { recalculate } from "./domain/planner";
import Requests from "./pages/Requests";
import Planning from "./pages/Planning";
import Efficiency from "./pages/Efficiency";
import JobEditor from "./components/JobEditor";
import TicketDetail from "./components/TicketDetail";
import { Modal } from "./components/ui";

type Page = "requests" | "planning" | "engineers" | "efficiency";
export default function App() {
  const [w, setW] = useState<Workspace>(loadWorkspace);
  const [role, setRole] = useState<Role>("support"),
    [page, setPage] = useState<Page>("requests");
  const [selected, setSelected] = useState<string>(),
    [editor, setEditor] = useState<null | "new" | "urgent" | string>(null);
  const [menu, setMenu] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"reset" | "import" | null>(null),
    [pending, setPending] = useState<Workspace>();
  const [resourceId, setResourceId] = useState<string>();
  const [help, setHelp] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
    } catch {
      setError(
        "Не удалось сохранить данные в браузере. Экспортируйте рабочий план.",
      );
    }
  }, [w]);
  function commit(next: Workspace, message: string) {
    setW(next);
    setError("");
    setNotice(message);
  }
  function run(fn: () => void) {
    try {
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function dispatcher() {
    if (role !== "dispatcher") throw new Error("Действие доступно диспетчеру.");
  }
  function canEdit(id: string) {
    if (role === "support" && w.tickets[id].owner !== "support-1")
      throw new Error("Поддержка изменяет только свои обращения.");
  }
  function plan() {
    dispatcher();
    const next = recalculate(structuredClone(w));
    audit(next, role, "План пересчитан");
    commit(next, "План готов. Ручные назначения и начатые работы сохранены.");
  }
  function saveJob(job: Job, info: TicketInfo) {
    const next = structuredClone(w),
      exists = next.data.jobs.some((j) => j.id === job.id);
    if (exists) {
      canEdit(job.id);
      if (
        locked(ticketStatus(w, job)) ||
        w.tickets[job.id].status === "cancelled"
      )
        throw new Error(
          "Начатую, закрытую или отменённую заявку нельзя редактировать.",
        );
    }
    if (!exists && next.data.jobs.length >= 100)
      throw new Error("В прототипе поддерживается до 100 заявок на день.");
    if (exists)
      next.data.jobs = next.data.jobs.map((j) => (j.id === job.id ? job : j));
    else next.data.jobs.push(job);
    next.tickets[job.id] = info;
    parseDataset(JSON.stringify(next.data));
    // Existing day plans are recomputed with their factual work and manual constraints preserved.
    const result = next.current ? recalculate(next) : next;
    audit(
      result,
      role,
      exists ? "Условия заявки изменены" : "Заявка создана",
      job.id,
    );
    commit(
      result,
      exists
        ? "Условия сохранены, план пересчитан."
        : "Заявка создана и передана диспетчеру.",
    );
    setEditor(null);
    setSelected(job.id);
  }
  function assign(a: Assignment) {
    dispatcher();
    if (!selected) return;
    const next = structuredClone(w);
    next.manual[selected] = a;
    const result = recalculate(next);
    audit(
      result,
      role,
      `Ручное назначение: ${w.data.engineers.find((e) => e.id === a.engineerId)?.name}, ${a.start}`,
      selected,
    );
    commit(result, "Назначение сохранено. Остальные работы пересчитаны.");
  }
  function release() {
    dispatcher();
    if (!selected) return;
    const next = structuredClone(w);
    delete next.manual[selected];
    const result = recalculate(next);
    audit(result, role, "Ручная фиксация снята", selected);
    commit(result, "Заявка возвращена в автоматическое планирование.");
  }
  function changeStatus(status: Status, progress: number, note: string) {
    if (!selected) return;
    canEdit(selected);
    const currentStatus = ticketStatus(
      w,
      w.data.jobs.find((j) => j.id === selected)!,
    );
    if (["completed", "cancelled"].includes(currentStatus))
      throw new Error(
        "Завершённые и отменённые заявки доступны только для просмотра.",
      );
    if (role !== "dispatcher" && status === "completed")
      throw new Error("Закрытие подтверждает диспетчер.");
    if (
      status !== "new" &&
      status !== "cancelled" &&
      !assignmentFor(w.current, selected)
    )
      throw new Error("Сначала диспетчер должен назначить инженера.");
    const order: Status[] = [
      "new",
      "assigned",
      "enroute",
      "in_progress",
      "review",
      "completed",
    ];
    if (
      status !== "cancelled" &&
      order.indexOf(status) < order.indexOf(currentStatus)
    )
      throw new Error("Фактический статус нельзя вернуть назад.");
    if (status === "cancelled" && !note.trim())
      throw new Error("Укажите причину отмены в комментарии.");
    if ((status === "completed" || status === "review") && progress !== 100)
      throw new Error("Для завершённой работы укажите 100%.");
    if (
      (status === "new" || status === "assigned" || status === "enroute") &&
      progress > 0
    )
      throw new Error("Для ненулевого выполнения выберите «В работе».");
    if (status === "in_progress" && (progress <= 0 || progress >= 100))
      throw new Error("Для работы в процессе выберите от 25% до 75%.");
    const next = structuredClone(w);
    next.tickets[selected] = {
      ...next.tickets[selected],
      status,
      progress: status === "cancelled" ? 0 : progress,
      note,
    };
    if (status === "cancelled") {
      delete next.manual[selected];
    }
    const result = next.current ? recalculate(next) : next;
    audit(
      result,
      role,
      status === "completed"
        ? "Диспетчер подтвердил выполнение"
        : status === "cancelled"
          ? `Заявка отменена: ${note}`
          : `Обновлён статус, выполнено ${progress}%`,
      selected,
    );
    commit(
      result,
      status === "review"
        ? "Готовность передана диспетчеру для подтверждения."
        : "Статус сохранён.",
    );
  }
  function exportPlan() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              dataset: w.data,
              tickets: w.tickets,
              manual: w.manual,
              current: w.current,
              optimized: w.optimized,
              baseline: w.baseline,
              history: w.history,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "dispatch-plan.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const nav = [
    {
      id: "requests",
      title: role === "support" ? "Мои заявки" : "Заявки",
      icon: ClipboardList,
    },
    ...(role === "dispatcher"
      ? [
          { id: "planning", title: "Маршруты и расписание", icon: Route },
          { id: "engineers", title: "Инженеры", icon: Users },
          {
            id: "efficiency",
            title: "Эффективность",
            icon: ChartNoAxesCombined,
          },
        ]
      : []),
  ];
  return (
    <div className="app">
      <header className="topbar">
        <button
          className="mobile-toggle"
          aria-label="Открыть меню"
          aria-expanded={menu}
          aria-controls="workspace-navigation"
          onClick={() => setMenu(!menu)}
        >
          <Menu size={20} />
        </button>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("requests");
          }}
        >
          <span className="brand-symbol">к</span>контур
          <span className="brand-tag">билайн бизнес</span>
        </a>
        <div className="topbar-right">
          <span className="demo-label">Прототип</span>
          <label className="role-switch">
            <span className="profile-avatar">
              {role === "support" ? "АС" : "ДВ"}
            </span>
            <select
              aria-label="Рабочее место"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role);
                setPage("requests");
                setSelected(undefined);
                setEditor(null);
                setMenu(false);
              }}
            >
              <option value="support">Анна · Поддержка</option>
              <option value="dispatcher">Дмитрий · Диспетчер</option>
            </select>
            <ChevronDown size={14} />
          </label>
        </div>
      </header>
      <aside
        id="workspace-navigation"
        className={`sidebar ${menu ? "open" : ""}`}
      >
        <div className="workspace-label">
          <span className="workspace-icon">
            <Headset size={18} />
          </span>
          <div>
            <b>Выездной сервис</b>
            <small>Москва · Юго-восток</small>
          </div>
        </div>
        <div className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => {
                setPage(item.id as Page);
                setMenu(false);
              }}
            >
              <item.icon size={18} />
              <span>{item.title}</span>
              {item.id === "requests" && <em>{w.data.jobs.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="online-dot" />
            <span>Данные сохранены локально</span>
          </div>
          <button onClick={() => setHelp(true)}>
            <CircleHelp size={17} />О прототипе
          </button>
          <button onClick={() => setConfirm("reset")}>
            <RotateCcw size={17} />
            Сбросить демоданные
          </button>
        </div>
      </aside>
      <main>
        <div className="breadcrumb">
          Выездной сервис <span>/</span> {nav.find((n) => n.id === page)?.title}
        </div>
        {error && (
          <div className="banner critical" role="alert">
            {error}
            <button
              aria-label="Скрыть ошибку"
              className="icon-button"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            <CheckCircle2 size={16} />
            {notice}
            <button
              className="icon-button"
              aria-label="Скрыть уведомление"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {page === "requests" && (
          <Requests
            key={role}
            workspace={w}
            role={role}
            onSelect={setSelected}
            onCreate={() => setEditor("new")}
          />
        )}
        {page === "planning" && role === "dispatcher" && (
          <Planning
            w={w}
            onPlan={() => run(plan)}
            onSelect={setSelected}
            onUrgent={() => setEditor("urgent")}
          />
        )}
        {page === "efficiency" && role === "dispatcher" && (
          <Efficiency w={w} onSelect={setSelected} />
        )}
        {page === "engineers" && role === "dispatcher" && (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">Ресурсы рабочего дня</div>
                <h1>Инженеры</h1>
                <p>
                  Квалификации, транспорт и оборудование для выполнения заявок.
                </p>
              </div>
              <span className="badge neutral">
                {w.data.engineers.length} инженеров
              </span>
            </div>
            <section className="card table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Инженер</th>
                    <th>Квалификации</th>
                    <th>Транспорт</th>
                    <th>Смена</th>
                    <th>Роутеров на день</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {w.data.engineers.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <b>{e.name}</b>
                        <small>{e.role}</small>
                      </td>
                      <td>
                        {e.skills.map((s) => (
                          <span className="badge neutral skill" key={s}>
                            {skillNames[s]}
                          </span>
                        ))}
                      </td>
                      <td>{transportNames[e.transport]}</td>
                      <td>{e.shift.join("–")}</td>
                      <td>{w.stock[e.id]}</td>
                      <td>
                        <button onClick={() => setResourceId(e.id)}>
                          <Settings2 size={15} />
                          Изменить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
        <div className="page-bottom">
          <span>Контур · {w.data.date} · Один участок, один рабочий день</span>
          <div className="actions">
            <a href="./demo-dataset.json" download>
              Пример JSON
            </a>
            {role === "dispatcher" && (
              <label className="button upload-button">
                <Upload size={14} />
                Импорт JSON
                <input
                  aria-label="Загрузить JSON"
                  type="file"
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      const imported = createWorkspace(
                        parseDataset(await file.text()),
                      );
                      setPending(imported);
                      setConfirm("import");
                    } catch {
                      setError(
                        "Не удалось прочитать JSON. Проверьте структуру по примеру.",
                      );
                    }
                  }}
                />
              </label>
            )}
            <button onClick={exportPlan}>
              <Download size={14} />
              Экспорт плана
            </button>
          </div>
        </div>
      </main>
      {selected && !editor && (
        <TicketDetail
          key={`${selected}-${w.history.length}`}
          w={w}
          id={selected}
          role={role}
          onClose={() => setSelected(undefined)}
          onEdit={() => setEditor(selected)}
          onAssign={assign}
          onRelease={release}
          onStatus={changeStatus}
        />
      )}
      {editor && (
        <JobEditor
          workspace={w}
          initialType={editor === "urgent" ? "emergency" : undefined}
          job={
            editor !== "new" && editor !== "urgent"
              ? w.data.jobs.find((j) => j.id === editor)
              : undefined
          }
          onSave={saveJob}
          onClose={() => setEditor(null)}
        />
      )}
      {confirm && (
        <Modal
          title={
            confirm === "reset"
              ? "Сбросить рабочий день?"
              : "Заменить данные рабочего дня?"
          }
          onClose={() => setConfirm(null)}
        >
          <p>
            Текущие заявки, назначения и история будут заменены. При
            необходимости сначала экспортируйте план.
          </p>
          <div className="modal-footer">
            <button onClick={() => setConfirm(null)}>Отмена</button>
            <button
              className="primary"
              onClick={() => {
                commit(
                  confirm === "reset" ? createWorkspace() : pending!,
                  "Данные рабочего дня обновлены.",
                );
                setConfirm(null);
                setPending(undefined);
                setSelected(undefined);
                setPage("requests");
              }}
            >
              Подтвердить
            </button>
          </div>
        </Modal>
      )}
      {resourceId && (
        <Modal
          title="Ресурсы инженера"
          onClose={() => setResourceId(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => {
                dispatcher();
                const f = new FormData(e.currentTarget),
                  next = structuredClone(w),
                  eng = next.data.engineers.find((e) => e.id === resourceId)!;
                const hasWork = w.current?.routes
                  .find((r) => r.engineerId === resourceId)
                  ?.stops.some((s) => locked(w.tickets[s.jobId].status));
                if (hasWork)
                  throw new Error(
                    "Ресурсы инженера с начатыми работами зафиксированы на день.",
                  );
                eng.skills = f.getAll("skills") as Skill[];
                if (!eng.skills.length)
                  throw new Error("Выберите хотя бы один навык.");
                next.stock[resourceId] = Number(f.get("stock"));
                const result = next.current ? recalculate(next) : next;
                audit(result, role, `Изменены ресурсы: ${eng.name}`);
                commit(
                  result,
                  "Ресурсы обновлены. Доступные заявки перераспределены.",
                );
                setResourceId(undefined);
              });
            }}
          >
            {error && (
              <div className="banner critical" role="alert">
                {error}
              </div>
            )}
            <p>{w.data.engineers.find((e) => e.id === resourceId)?.name}</p>
            <fieldset>
              <legend>Допуски к работам</legend>
              {Object.entries(skillNames).map(([key, label]) => (
                <label className="checkbox" key={key}>
                  <input
                    name="skills"
                    value={key}
                    type="checkbox"
                    defaultChecked={w.data.engineers
                      .find((e) => e.id === resourceId)
                      ?.skills.includes(key as Skill)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label>
              Запас роутеров на день
              <input
                name="stock"
                type="number"
                min="0"
                max="100"
                step="1"
                required
                defaultValue={w.stock[resourceId]}
              />
            </label>
            <div className="modal-footer">
              <button type="button" onClick={() => setResourceId(undefined)}>
                Отмена
              </button>
              <button className="primary">Сохранить ресурсы</button>
            </div>
          </form>
        </Modal>
      )}
      {help && (
        <Modal title="О прототипе «Контур»" onClose={() => setHelp(false)}>
          <p>
            Два демонстрационных рабочих места используют общий рабочий день в
            этом браузере. Это переключение ролей, а не авторизация. Между
            компьютерами данные пока не синхронизируются.
          </p>
          <p>
            Приоритет: авария → подключение → ремонт / дозаказ. Оборудование
            выдаётся на день. Учитываются навыки, транспорт, клиентское окно,
            время смены и поступления заявки.
          </p>
          <p>
            Норматив дороги заменён расчётным временем по координатам: работа и
            документы занимают 70 / 80 / 30 / 20 минут. Это явно принятое
            допущение; дорожный движок и геокодирование ещё не подключены.
          </p>
          <p>
            Визуальная система адаптирована по Polaris: формы, таблицы,
            карточки, состояния и токены. Рабочий сценарий начинается с создания
            заявки.
          </p>
        </Modal>
      )}
    </div>
  );
}
