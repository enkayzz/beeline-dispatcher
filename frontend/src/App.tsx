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
  CalendarDays,
} from "lucide-react";
import type { Job } from "./types";
import { parseDataset } from "./validation";
import {
  audit,
  assignmentFor,
  createWorkspace,
  dayKey,
  engineerSettingsFor,
  supportId,
  personalJobs,
  switchDay,
  importDay,
  loadWorkspace,
  locked,
  STORAGE_KEY,
  ticketStatus,
  statusNames,
  type Assignment,
  type Role,
  type Status,
  type TicketInfo,
  type Workspace,
} from "./domain/workspace";
import { recalculate } from "./domain/planner";
import { demoSnapshot, demoTimes, type DemoPeriod } from "./domain/demoStates";
import Requests from "./pages/Requests";
import Planning from "./pages/Planning";
import Efficiency from "./pages/Efficiency";
import Engineers from "./pages/Engineers";
import EngineerSchedule from "./pages/EngineerSchedule";
import JobEditor from "./components/JobEditor";
import TicketDetail from "./components/TicketDetail";
import type { EngineerUpdate } from "./components/EngineerEditor";
import { Modal } from "./components/ui";

type Page =
  "requests" | "planning" | "engineers" | "efficiency" | "my_schedule";
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
  const [help, setHelp] = useState(false);
  const [demoPeriod, setDemoPeriod] = useState<DemoPeriod>();
  const [liveWorkspace, setLiveWorkspace] = useState<Workspace>();
  function showDemo(period: DemoPeriod) {
    if (!demoPeriod) setLiveWorkspace(w);
    setDemoPeriod(period);
    setW(demoSnapshot(period));
    setSelected(undefined);
    setNotice("");
    setError("");
  }
  const currentEngineerId = supportId(w);
  const ownJobs = personalJobs(w);
  function selectDate(date: string) {
    if (!date) return;
    run(() => {
      setW(switchDay(w, date));
      setSelected(undefined);
      setEditor(null);
      setNotice("");
      setError("");
    });
  }
  useEffect(() => {
    if (demoPeriod) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
    } catch {
      setError(
        "Не удалось сохранить данные в браузере. Экспортируйте рабочий план.",
      );
    }
  }, [w, demoPeriod]);
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
  function saveEngineer(engineerId: string, update: EngineerUpdate) {
    const source = role;
    if (source !== "dispatcher" && source !== "support")
      throw new Error("Изменение доступно поддержке или диспетчеру.");
    if (source === "support" && engineerId !== currentEngineerId)
      throw new Error("Можно менять только собственные рабочие данные.");
    const beforeSettings = engineerSettingsFor(w, engineerId);
    if (source === "support" && !beforeSettings.canSelfEdit)
      throw new Error("Диспетчер запретил самостоятельное редактирование.");
    if (
      !Number.isInteger(update.stock) ||
      update.stock < 0 ||
      update.stock > 100
    )
      throw new Error(
        "Количество оборудования должно быть целым числом от 0 до 100.",
      );
    for (const [day, value] of Object.entries(update.settings.weekly)) {
      if (!value.enabled) continue;
      const duration =
        Number(value.end.slice(0, 2)) * 60 +
        Number(value.end.slice(3)) -
        (Number(value.start.slice(0, 2)) * 60 + Number(value.start.slice(3)));
      if (duration < 120)
        throw new Error(
          `Рабочий интервал ${day.toUpperCase()} должен быть не короче двух часов.`,
        );
    }
    for (const period of update.settings.unavailable) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(period.date) || period.from >= period.to)
        throw new Error("Проверьте дату и время периода недоступности.");
    }
    const hasLockedWork = w.current?.routes
      .find((route) => route.engineerId === engineerId)
      ?.stops.some((stop) => locked(w.tickets[stop.jobId].status));
    const currentEngineer = w.data.engineers.find(
      (item) => item.id === engineerId,
    )!;
    if (
      source === "support" &&
      (update.settings.canSelfEdit !== beforeSettings.canSelfEdit ||
        JSON.stringify(update.skills) !==
          JSON.stringify(currentEngineer.skills))
    )
      throw new Error(
        "Права доступа и допуски к работам изменяет только диспетчер.",
      );
    const operationalChange =
      currentEngineer.transport !== update.transport ||
      w.stock[engineerId] !== update.stock ||
      JSON.stringify(currentEngineer.skills) !==
        JSON.stringify(update.skills) ||
      JSON.stringify(beforeSettings.weekly) !==
        JSON.stringify(update.settings.weekly) ||
      JSON.stringify(beforeSettings.unavailable) !==
        JSON.stringify(update.settings.unavailable);
    if (hasLockedWork && operationalChange)
      throw new Error(
        "Нельзя менять транспорт, оборудование или график после начала первой работы. Можно изменить только право доступа.",
      );
    const next = structuredClone(w);
    const engineer = next.data.engineers.find((item) => item.id === engineerId);
    if (!engineer) throw new Error("Специалист поддержки не найден.");
    engineer.transport = update.transport;
    engineer.skills = update.skills;
    next.stock[engineerId] = update.stock;
    next.engineerSettings[engineerId] = structuredClone(update.settings);
    const today = update.settings.weekly[dayKey(next.data.date)];
    engineer.shift = today.enabled
      ? [today.start, today.end]
      : ["00:00", "00:00"];
    const result = next.current ? recalculate(next) : next;
    for (const [date, savedDay] of Object.entries(result.days ?? {})) {
      const employee = savedDay.data.engineers.find((e) => e.id === engineerId);
      if (!employee) continue;
      savedDay.engineerSettings[engineerId] ??= engineerSettingsFor(
        savedDay,
        engineerId,
      );
      savedDay.engineerSettings[engineerId].canSelfEdit =
        update.settings.canSelfEdit;
      if (date < w.data.date || !operationalChange) continue;
      const frozen = savedDay.current?.routes
        .find((r) => r.engineerId === engineerId)
        ?.stops.some((s) => locked(savedDay.tickets[s.jobId].status));
      if (frozen)
        throw new Error(
          `На ${date} есть начатые или завершённые работы. Изменения графика и ресурсов не сохранены.`,
        );
      employee.transport = update.transport;
      employee.skills = [...update.skills];
      savedDay.stock[engineerId] = update.stock;
      savedDay.engineerSettings[engineerId] = structuredClone(update.settings);
      const shift = update.settings.weekly[dayKey(date)];
      employee.shift = shift.enabled
        ? [shift.start, shift.end]
        : ["00:00", "00:00"];
      result.days![date] = savedDay.current ? recalculate(savedDay) : savedDay;
    }
    audit(
      result,
      source,
      source === "dispatcher"
        ? `Диспетчер обновил график и ресурсы: ${engineer.name}`
        : "Поддержка обновила свой график и ресурсы",
    );
    commit(
      result,
      "Настройки поддержки сохранены. Будущие назначения пересчитаны.",
    );
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
  function changeStatus(status: Status, note: string) {
    if (!selected) return;
    if (
      role === "support" &&
      assignmentFor(w.current, selected)?.engineerId !== currentEngineerId &&
      !(
        status === "cancelled" &&
        w.tickets[selected].owner === "support-1" &&
        !assignmentFor(w.current, selected)
      )
    )
      throw new Error(
        "Изменять выполнение можно только у назначенных вам работ.",
      );
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
      throw new Error(
        "Сначала диспетчер должен назначить специалиста поддержки.",
      );
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
    const next = structuredClone(w);
    next.tickets[selected] = {
      ...next.tickets[selected],
      status,
      progress: status === "completed" || status === "review" ? 100 : 0,
      note,
      lastAssignment:
        assignmentFor(w.current, selected) ??
        next.tickets[selected].lastAssignment,
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
          : `Статус: ${statusNames[status]}`,
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
              engineerSettings: w.engineerSettings,
              current: w.current,
              optimized: w.optimized,
              baseline: w.baseline,
              history: w.history,
              days: w.days,
              stock: w.stock,
              supportEngineerId: currentEngineerId,
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
    ...(role === "support"
      ? [{ id: "my_schedule", title: "Моё расписание", icon: CalendarDays }]
      : []),
    ...(role === "dispatcher"
      ? [
          { id: "planning", title: "Маршруты и расписание", icon: Route },
          { id: "engineers", title: "График поддержки", icon: Users },
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
              {role === "support" ? "АБ" : "ДВ"}
            </span>
            <select
              aria-label="Рабочее место"
              value={role}
              onChange={(e) => {
                const nextRole = e.target.value as Role;
                setRole(nextRole);
                setPage("requests");
                setSelected(undefined);
                setEditor(null);
                setMenu(false);
              }}
            >
              <option value="support">
                {w.data.engineers
                  .find((e) => e.id === currentEngineerId)
                  ?.name.split(" ")[0] ?? "Сотрудник"}{" "}
                · Поддержка
              </option>
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
              {item.id === "requests" && (
                <em data-testid="request-nav-count">
                  {role === "support" ? ownJobs.length : w.data.jobs.length}
                </em>
              )}
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
        <div className="workspace-date-bar">
          <label>
            Рабочая дата{" "}
            <input
              aria-label="Рабочая дата"
              type="date"
              value={w.data.date}
              onChange={(e) => selectDate(e.target.value)}
            />
          </label>
          <span>Заявки, расписание и показатели за выбранный день</span>
          <div className="demo-switch" aria-label="Демонстрация рабочего дня">
            <span>Демо</span>
            {(["morning", "day", "evening"] as DemoPeriod[]).map((period) => (
              <button
                key={period}
                aria-pressed={demoPeriod === period}
                onClick={() => showDemo(period)}
              >
                {demoTimes[period].label}
              </button>
            ))}
            {demoPeriod && (
              <button
                onClick={() => {
                  if (liveWorkspace) setW(liveWorkspace);
                  setDemoPeriod(undefined);
                  setSelected(undefined);
                  setNotice("");
                }}
              >
                Выйти из демо
              </button>
            )}
          </div>
        </div>
        {demoPeriod && (
          <div className="demo-caption">
            Демонстрация · {demoTimes[demoPeriod].time} ·{" "}
            {demoTimes[demoPeriod].hint}. Изменения в демо не затрагивают ваши
            данные.
          </div>
        )}
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
            key={`${role}-${w.data.date}`}
            workspace={w}
            role={role}
            onSelect={setSelected}
            onPlan={() => run(plan)}
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
          <Engineers w={w} onSave={saveEngineer} />
        )}
        {page === "my_schedule" &&
          role === "support" &&
          currentEngineerId &&
          w.data.engineers.some((e) => e.id === currentEngineerId) && (
            <EngineerSchedule
              key={w.data.date}
              w={w}
              onDateChange={selectDate}
              engineerId={currentEngineerId}
              onSelect={setSelected}
              onSave={(update) => saveEngineer(currentEngineerId, update)}
            />
          )}
        {page === "my_schedule" &&
          !w.data.engineers.some((e) => e.id === currentEngineerId) && (
            <section className="card padded">
              На выбранную дату ваш профиль отсутствует в составе команды.
              Выберите другой сохранённый день.
            </section>
          )}
        <div className="page-bottom">
          <span>Контур · {w.data.date} · Выбранный рабочий день</span>
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
          currentEngineerId={currentEngineerId}
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
            {confirm === "reset"
              ? "Все сохранённые дни будут заменены демоданными. При необходимости сначала экспортируйте план."
              : `Будут загружены заявки за ${pending?.data.date}. Если эта дата уже сохранена, её данные будут заменены; остальные дни сохранятся.`}
          </p>
          <div className="modal-footer">
            <button onClick={() => setConfirm(null)}>Отмена</button>
            <button
              className="primary"
              onClick={() => {
                commit(
                  confirm === "reset"
                    ? createWorkspace()
                    : importDay(w, pending!),
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
