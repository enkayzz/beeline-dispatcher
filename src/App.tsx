import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bike,
  CalendarDays,
  Car,
  ChartNoAxesCombined,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileJson,
  Footprints,
  GitCompareArrows,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  Map,
  Menu,
  Navigation,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  Sparkles,
  TrainFront,
  TriangleAlert,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { Dataset, Engineer, Plan, PlanPair, Transport } from "./types";
import { skillNames, transportNames } from "./types";
import { api, clock, minutes } from "./api";
import { demo, urgentJob } from "./demo";
import { parseDataset } from "./validation";
import MapView from "./MapView";

const fmt = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("");
const transportIcon: Record<Transport, typeof Car> = {
  car: Car,
  walk: Footprints,
  bike: Bike,
  transit: TrainFront,
};
function Avatar({
  engineer,
  small = false,
}: {
  engineer: Engineer;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? "small" : ""}`}
      style={{ color: engineer.color, background: `${engineer.color}17` }}
    >
      {initials(engineer.name)}
    </span>
  );
}
function Download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input, select, [tabindex="0"]',
          ) ?? [],
        );
        if (!items.length) return;
        if (
          event.shiftKey &&
          (document.activeElement === items[0] ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <button
          className="icon-btn close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>
        <div className="modal-symbol">
          <Sparkles size={24} />
        </div>
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<Dataset>(structuredClone(demo));
  const drawerRef = useRef<HTMLElement>(null);
  const [plans, setPlans] = useState<PlanPair>();
  const [previous, setPrevious] = useState<Plan>();
  const [changes, setChanges] = useState<string[]>([]);
  const [page, setPage] = useState("workspace");
  const [mapTab, setMapTab] = useState("map");
  const [selectedId, setSelectedId] = useState<string>();
  const [engineerId, setEngineerId] = useState<string>();
  const [modal, setModal] = useState<"import" | "event" | "help" | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [mobileNav, setMobileNav] = useState(false),
    [eventAt, setEventAt] = useState("11:00");
  const [eventWindow, setEventWindow] = useState<[string, string]>([
    "11:00",
    "13:00",
  ]);
  const [eventDuration, setEventDuration] = useState(60);
  const plan = plans?.optimized;
  const selected = data.jobs.find((j) => j.id === selectedId);
  const selectedRoute = plan?.routes.find((r) =>
    r.stops.some((s) => s.jobId === selectedId),
  );
  const selectedEngineer = data.engineers.find(
    (e) => e.id === selectedRoute?.engineerId,
  );
  const selectedStop = selectedRoute?.stops.find((s) => s.jobId === selectedId);
  const unassigned = plan?.unassigned.find((u) => u.jobId === selectedId);
  const closeModal = useCallback(() => {
    setModal(null);
    setError("");
  }, []);
  const selectJob = useCallback((id: string) => setSelectedId(id), []);
  useEffect(() => {
    if (!selectedId) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(undefined);
      if (event.key === "Tab") {
        const items = Array.from(
          drawerRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [tabindex="0"]',
          ) ?? [],
        );
        if (
          event.shiftKey &&
          (document.activeElement === items[0] ||
            document.activeElement === drawerRef.current)
        ) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [selectedId]);
  const eventExists = data.jobs.some((j) => j.id === urgentJob.id);
  const routeFor = (id: string, p = plan) =>
    p?.routes.find((r) => r.stops.some((s) => s.jobId === id));
  const engineerFor = (id: string, p = plan) =>
    data.engineers.find((e) => e.id === routeFor(id, p)?.engineerId);
  const visibleJobs = data.jobs.filter(
    (j) =>
      (!query ||
        `${j.id} ${j.title} ${j.address}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "unassigned" &&
          plan?.unassigned.some((u) => u.jobId === j.id)) ||
        (filter === "urgent" && j.priority === "urgent")),
  );

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const result = await api.plan(data);
      setPlans(result);
      setPrevious(undefined);
      setChanges([]);
      setNotice(
        "План готов. Проверьте маршруты и заявки, которым нужен диспетчер.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Не удалось построить план. Повторите попытку.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function replan() {
    if (!plan) return;
    if (
      !eventAt ||
      !eventWindow[0] ||
      !eventWindow[1] ||
      eventWindow[0] > eventWindow[1] ||
      eventWindow[1] < eventAt ||
      !Number.isInteger(eventDuration) ||
      eventDuration < 1 ||
      eventDuration > 240
    ) {
      setError(
        "Проверьте время события, окно заявки и длительность от 1 до 240 минут.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.replan(data, plan, {
        type: "urgent",
        at: eventAt,
        job: { ...urgentJob, window: eventWindow, duration: eventDuration },
      });
      setData(result.dataset);
      setPlans(result.plans);
      setPrevious(result.previous);
      setChanges(result.changedIds);
      setModal(null);
      setPage("workspace");
      setSelectedId(urgentJob.id);
      setEngineerId(undefined);
      setNotice(
        `План обновлён на ${eventAt}. Начатые работы сохранены, изменено заявок: ${result.changedIds.length}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить план.");
    } finally {
      setBusy(false);
    }
  }
  function reset(next: Dataset) {
    setData(next);
    setPlans(undefined);
    setPrevious(undefined);
    setChanges([]);
    setSelectedId(undefined);
    setEngineerId(undefined);
    setPage("workspace");
    setQuery("");
    setFilter("all");
    setModal(null);
    setError("");
    setNotice("Данные загружены. Можно построить план.");
    setEventAt("11:00");
    setEventWindow(["11:00", "13:00"]);
    setEventDuration(60);
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("Файл больше 2 МБ. Используйте набор до 100 заявок.");
      return;
    }
    try {
      reset(parseDataset(await file.text()));
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "Не удалось прочитать JSON. Скачайте пример и проверьте формат."
          : e instanceof Error
            ? e.message
            : "Ошибка файла.",
      );
    }
  }
  const openModal = (kind: typeof modal) => {
    setError("");
    setModal(kind);
  };
  const nav = [
    { id: "workspace", label: "Рабочий день", icon: LayoutDashboard },
    { id: "jobs", label: "Заявки", icon: FileJson },
    { id: "engineers", label: "Инженеры", icon: Users },
    { id: "compare", label: "Эффективность", icon: ChartNoAxesCombined },
  ];

  return (
    <div className="app-layout">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("workspace");
          }}
        >
          <span className="brand-mark">
            <RouteIcon size={24} />
          </span>
          <span>
            контур
            <span className="brand-caption">билайн бизнес · прототип</span>
          </span>
        </a>
        <div className="workspace-switch">
          <div className="workspace-letter">М</div>
          <div>
            <b>Москва</b>
            <small>Выездной сервис</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-heading">ДИСПЕТЧЕРСКАЯ</span>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setPage(id);
                setMobileNav(false);
              }}
              className={`nav-item ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "jobs" && <em>{data.jobs.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <div>
            <span className="status-dot" /> Демо-пространство
          </div>
          <p>Проверьте весь рабочий день — от первой заявки до нового плана.</p>
          <button onClick={() => openModal("help")}>
            Как это работает <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button className="help-link" onClick={() => openModal("help")}>
            <CircleHelp size={18} /> Сценарий демонстрации
          </button>
          <div className="profile">
            <span className="profile-avatar">ДС</span>
            <div>
              <b>Диспетчер смены</b>
              <small>Рабочее пространство</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-menu"
              aria-label="Открыть меню"
              onClick={() => setMobileNav(!mobileNav)}
            >
              <Menu size={20} />
            </button>
            <span>Выездной сервис</span>
            <ChevronRight size={14} />
            <b>{nav.find((n) => n.id === page)?.label}</b>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">ДЕМО</span>
            <span className="top-date">
              <CalendarDays size={15} />
              {new Date(data.date + "T12:00:00").toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              className="icon-btn"
              aria-label="Показать уведомления"
              onClick={() =>
                setNotice(
                  plan
                    ? `Внимание диспетчера: ${plan.unassigned.length} неназначенных заявок.`
                    : "Данные готовы. Постройте первый план.",
                )
              }
            >
              <Bell size={18} />
              <span className="bell-dot" />
            </button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">ПЛАНИРОВАНИЕ ВЫЕЗДОВ</div>
              <h1>
                {page === "workspace"
                  ? "Всё по маршруту."
                  : page === "jobs"
                    ? "Заявки на сегодня"
                    : page === "engineers"
                      ? "Ваша команда"
                      : "Эффективность плана"}
              </h1>
              <p>
                {page === "workspace"
                  ? "Люди, заявки и маршруты — в одном рабочем дне."
                  : page === "jobs"
                    ? "Все работы, временные окна и решения по назначениям."
                    : page === "engineers"
                      ? "Навыки, транспорт и загрузка каждого специалиста."
                      : "Сравните решения на одинаковых данных и ограничениях."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => openModal("import")}
              >
                <Upload size={16} /> Загрузить данные
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={plan ? () => openModal("event") : generate}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : plan ? (
                  <Plus size={17} />
                ) : (
                  <Sparkles size={17} />
                )}{" "}
                {busy
                  ? "Рассчитываем…"
                  : plan
                    ? "Событие дня"
                    : "Построить план"}
              </button>
            </div>
          </div>
          <div className="journey">
            {["Данные загружены", "План построен", "Изменения учтены"].map(
              (step, i) => (
                <div
                  key={step}
                  className={
                    i === 0 || (i === 1 && plan) || (i === 2 && previous)
                      ? "done"
                      : ""
                  }
                >
                  <span>
                    {i === 0 || (i === 1 && plan) || (i === 2 && previous) ? (
                      <Check size={12} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {step}
                  {i < 2 && <div className="journey-line" />}
                </div>
              ),
            )}
            <span className="dataset-name">{data.name}</span>
          </div>
          {notice && (
            <div className="notice" role="status">
              <CheckCheck size={18} />
              <span>{notice}</span>
              <button
                className="icon-btn"
                aria-label="Скрыть уведомление"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {error && !modal && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="stats-grid">
            <Stat
              label="Заявок в плане"
              value={plan ? `${plan.metrics.assigned}` : "—"}
              suffix={`/ ${data.jobs.length}`}
              icon={<CheckCheck size={20} />}
              detail={
                plan
                  ? "С учётом обязательных ограничений"
                  : "Данные готовы к планированию"
              }
            />
            <Stat
              label="Инженеров на выезде"
              value={plan ? String(plan.metrics.engineers) : "—"}
              suffix={`/ ${data.engineers.length}`}
              icon={<Users size={20} />}
              detail={
                plan
                  ? `${data.engineers.length - plan.metrics.engineers} в резерве`
                  : "Навыки и транспорт учтём в плане"
              }
            />
            <Stat
              label="Общий маршрут"
              value={plan ? fmt(plan.metrics.km) : "—"}
              suffix="км"
              icon={<RouteIcon size={20} />}
              detail={
                plan && plans
                  ? `${fmt(plans.baseline.metrics.km - plan.metrics.km)} км разницы с базовым`
                  : "Оценка расстояния по координатам"
              }
            />
            <Stat
              label="Требуют внимания"
              value={plan ? String(plan.unassigned.length) : "—"}
              icon={<TriangleAlert size={20} />}
              warning={!!plan?.unassigned.length}
              detail={plan ? "Неназначенные заявки" : "Проверим при построении"}
              onClick={
                plan
                  ? () => {
                      setPage("jobs");
                      setFilter("unassigned");
                    }
                  : undefined
              }
            />
          </div>

          {page === "workspace" && (
            <>
              <div className="workspace-grid">
                <section className="panel routes-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Маршруты команды{" "}
                        <span className="count-pill">
                          {plan?.metrics.engineers ?? 0}
                        </span>
                      </h2>
                      <p>
                        {plan
                          ? "Выберите инженера на карте"
                          : "План ещё не построен"}
                      </p>
                    </div>
                    <button
                      className="icon-btn"
                      aria-label="Показать всех инженеров"
                      onClick={() => setEngineerId(undefined)}
                    >
                      <ListFilter size={18} />
                    </button>
                  </div>
                  <div className="engineer-list">
                    {data.engineers.map((e) => {
                      const r = plan?.routes.find((r) => r.engineerId === e.id),
                        active = !!r?.stops.length;
                      const Icon = transportIcon[e.transport];
                      return (
                        <button
                          key={e.id}
                          className={`engineer-card ${engineerId === e.id ? "selected" : ""}`}
                          onClick={() =>
                            setEngineerId(
                              engineerId === e.id ? undefined : e.id,
                            )
                          }
                        >
                          <div className="engineer-top">
                            <Avatar engineer={e} />
                            <div>
                              <b>{e.name}</b>
                              <span>
                                <Icon size={12} />
                                {transportNames[e.transport]}
                              </span>
                            </div>
                            <span
                              className={`tiny-dot ${active ? "" : "idle"}`}
                              style={
                                active ? { background: e.color } : undefined
                              }
                            />
                          </div>
                          <div className="engineer-meta">
                            <span>
                              {active
                                ? `Заявок: ${r.stops.length}`
                                : "В резерве"}
                            </span>
                            <b>{active ? `${fmt(r.km)} км` : "—"}</b>
                          </div>
                          <div className="route-track">
                            {active ? (
                              r.stops.map((s, i) => (
                                <span
                                  key={s.jobId}
                                  title={`№ ${s.jobId} · ${clock(s.start)}`}
                                  style={{ background: e.color }}
                                >
                                  {i + 1}
                                </span>
                              ))
                            ) : (
                              <span className="reserve-line" />
                            )}
                          </div>
                          {active && (
                            <div className="engineer-hours">
                              <span>{clock(r.stops[0].start)}</span>
                              <span>
                                {clock(r.stops.at(-1)!.end)}
                                <ChevronRight size={12} />
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="route-panel-footer">
                    <ShieldCheck size={15} />
                    <span>Навыки · время · транспорт</span>
                  </div>
                </section>
                <section className="panel map-panel">
                  <div className="map-toolbar">
                    <div className="segmented">
                      <button
                        className={mapTab === "map" ? "active" : ""}
                        onClick={() => setMapTab("map")}
                      >
                        <Map size={15} />
                        Карта
                      </button>
                      <button
                        className={mapTab === "timeline" ? "active" : ""}
                        onClick={() => setMapTab("timeline")}
                      >
                        <Clock3 size={15} />
                        Расписание
                      </button>
                    </div>
                    <div className="map-toolbar-right">
                      <span className="live-dot" />
                      {plan ? "Предложенный план" : "Предпросмотр данных"}
                      <button
                        className="icon-btn"
                        disabled={!plan}
                        aria-label="Скачать план JSON"
                        onClick={() =>
                          Download(
                            { dataset: data, plan },
                            "dispatch-plan.json",
                          )
                        }
                      >
                        <ArrowDownToLine size={17} />
                      </button>
                    </div>
                  </div>
                  {mapTab === "map" ? (
                    <MapView
                      data={data}
                      plan={plan}
                      selectedId={selectedId}
                      engineerId={engineerId}
                      onSelect={selectJob}
                    />
                  ) : (
                    <Timeline data={data} plan={plan} onSelect={selectJob} />
                  )}
                  <div className="map-legend">
                    {data.engineers
                      .filter((e) =>
                        plan?.routes.some(
                          (r) => r.engineerId === e.id && r.stops.length,
                        ),
                      )
                      .map((e) => (
                        <button
                          key={e.id}
                          onClick={() =>
                            setEngineerId(
                              engineerId === e.id ? undefined : e.id,
                            )
                          }
                          className={engineerId === e.id ? "picked" : ""}
                        >
                          <i style={{ background: e.color }} />
                          {e.name.split(" ")[0]}
                        </button>
                      ))}
                    <span>
                      <i className="warning-dot" />
                      {plan ? "Не назначено" : "Заявка"}
                    </span>
                    <span className="legend-help">
                      Нажмите на точку, чтобы открыть заявку
                    </span>
                  </div>
                </section>
              </div>
              {!plan ? (
                <div className="first-plan">
                  <span className="first-plan-icon">
                    <Sparkles size={22} />
                  </span>
                  <div>
                    <h3>Рабочий день начинается с хорошего плана</h3>
                    <p>
                      Распределим {data.jobs.length} заявок с учётом навыков,
                      временных окон и транспорта.
                    </p>
                  </div>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={generate}
                  >
                    Построить план <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="bottom-grid">
                  <section className="panel attention-panel">
                    <div className="panel-heading">
                      <h2>
                        <span className="amber-icon">
                          <TriangleAlert size={17} />
                        </span>
                        Внимание диспетчера
                      </h2>
                      <span className="count-pill amber">
                        {plan.unassigned.length}
                      </span>
                    </div>
                    {plan.unassigned.length ? (
                      plan.unassigned.map((u) => {
                        const j = data.jobs.find((j) => j.id === u.jobId)!;
                        return (
                          <button
                            className="attention-row"
                            key={j.id}
                            onClick={() => selectJob(j.id)}
                          >
                            <div>
                              <span className="job-number">№ {j.id}</span>
                              <b>{j.title}</b>
                              <p>{u.reason}</p>
                            </div>
                            <ChevronRight size={18} />
                          </button>
                        );
                      })
                    ) : (
                      <div className="all-good">
                        <CheckCheck size={19} /> Все заявки распределены
                      </div>
                    )}
                  </section>
                  <section className="panel summary-panel">
                    <div className="panel-heading">
                      <h2>{previous ? "Что изменилось" : "План в цифрах"}</h2>
                      <GitCompareArrows size={18} />
                    </div>
                    <p>
                      {previous
                        ? `${changes.length} заявок с новым назначением или временем. Уже начатые работы сохранены.`
                        : "Сравните пробег и число исполнителей с последовательным назначением заявок."}
                    </p>
                    <div className="summary-values">
                      <div>
                        <b>
                          {previous ? changes.length : plan.metrics.engineers}
                        </b>
                        <span>{previous ? "изменений" : "инженеров"}</span>
                      </div>
                      <div>
                        <b>
                          {fmt(plan.metrics.km)}
                          <small> км</small>
                        </b>
                        <span>суммарный маршрут</span>
                      </div>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setPage("compare")}
                    >
                      Открыть сравнение <ArrowRight size={16} />
                    </button>
                  </section>
                </div>
              )}
            </>
          )}

          {page === "jobs" && (
            <section className="panel data-panel">
              <div className="table-toolbar">
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Поиск заявок"
                    placeholder="Адрес, номер или название"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="filter-chips">
                  {[
                    ["all", "Все"],
                    ["unassigned", "Не назначены"],
                    ["urgent", "Срочные"],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      className={filter === v ? "active" : ""}
                      onClick={() => setFilter(v)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="muted">{visibleJobs.length} заявок</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Заявка / адрес</th>
                      <th>Окно начала</th>
                      <th>Работа</th>
                      <th>Требования</th>
                      <th>Исполнитель</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleJobs.map((j) => {
                      const e = engineerFor(j.id);
                      return (
                        <tr key={j.id} onClick={() => selectJob(j.id)}>
                          <td>
                            <button
                              className="job-link"
                              onClick={() => selectJob(j.id)}
                            >
                              № {j.id} <span>{j.title}</span>
                            </button>
                            <small>{j.address}</small>
                          </td>
                          <td className="nowrap">{j.window.join(" — ")}</td>
                          <td>{j.duration} мин</td>
                          <td>
                            <span className="skill-tag">
                              {skillNames[j.skill]}
                            </span>
                            {j.transport && (
                              <small>{transportNames[j.transport]}</small>
                            )}
                          </td>
                          <td>
                            {e ? (
                              <span className="inline-engineer">
                                <Avatar engineer={e} small />
                                {e.name}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge ${e ? "green" : plan ? "amber" : "gray"}`}
                            >
                              {e
                                ? "Назначена"
                                : plan
                                  ? "Не назначена"
                                  : "Входящая"}
                            </span>
                            {j.priority === "urgent" && (
                              <span className="badge red">Срочная</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!visibleJobs.length && (
                <div className="empty-state">
                  <Search size={28} />
                  <h3>Заявки не найдены</h3>
                  <p>Измените запрос или сбросьте фильтр.</p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Показать все
                  </button>
                </div>
              )}
            </section>
          )}

          {page === "engineers" && (
            <div className="team-grid">
              {data.engineers.map((e) => {
                const route = plan?.routes.find((r) => r.engineerId === e.id);
                const Icon = transportIcon[e.transport];
                return (
                  <section className="panel team-card" key={e.id}>
                    <div className="team-header">
                      <Avatar engineer={e} />
                      <span
                        className={`badge ${route?.stops.length ? "green" : "gray"}`}
                      >
                        {route?.stops.length ? "На маршруте" : "В резерве"}
                      </span>
                    </div>
                    <h2>{e.name}</h2>
                    <p>{e.role}</p>
                    <div className="team-facts">
                      <span>
                        <Clock3 size={16} />
                        {e.shift.join(" — ")}
                      </span>
                      <span>
                        <Icon size={16} />
                        {transportNames[e.transport]}
                      </span>
                    </div>
                    <div className="skills">
                      {e.skills.map((s) => (
                        <span key={s} className="skill-tag">
                          {skillNames[s]}
                        </span>
                      ))}
                    </div>
                    <div className="team-footer">
                      <span>
                        <b>{route?.stops.length ?? 0}</b> заявок
                      </span>
                      <span>
                        <b>{fmt(route?.km ?? 0)}</b> км
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setEngineerId(e.id);
                          setPage("workspace");
                        }}
                      >
                        На карте <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {page === "compare" &&
            (plans ? (
              <>
                <section className="panel compare-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Предложенный план и базовый</h2>
                      <p>
                        Одинаковые заявки, инженеры и ограничения
                        {previous ? " · после события" : ""}
                      </p>
                    </div>
                    <span className="badge green">
                      <ShieldCheck size={13} /> Ограничения учтены
                    </span>
                  </div>
                  <div className="comparison-grid">
                    <div className="comparison-labels">
                      <span>Показатель</span>
                      <b>Назначено заявок</b>
                      <b>Задействовано инженеров</b>
                      <b>Суммарный пробег</b>
                      <b>Время в пути</b>
                    </div>
                    {[
                      {
                        p: plans.baseline,
                        title: "Базовый план",
                        subtitle: "По порядку поступления",
                      },
                      {
                        p: plan!,
                        title: "Предложенный план",
                        subtitle: "Демонстрационная эвристика",
                      },
                    ].map(({ p, title, subtitle }, i) => (
                      <div
                        key={title}
                        className={`comparison-column ${i === 1 ? "recommended" : ""}`}
                      >
                        <div>
                          <b>{title}</b>
                          <small>{subtitle}</small>
                        </div>
                        <strong>
                          {p.metrics.assigned}{" "}
                          <small>/ {data.jobs.length}</small>
                        </strong>
                        <strong>{p.metrics.engineers}</strong>
                        <strong>
                          {fmt(p.metrics.km)} <small>км</small>
                        </strong>
                        <strong>
                          {p.metrics.travel} <small>мин</small>
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="comparison-note">
                    <CircleHelp size={17} />
                    <p>
                      Базовый алгоритм назначает заявку первому подходящему
                      доступному инженеру по порядку списка. Расстояния
                      рассчитаны по прямой, время — по условной скорости
                      транспорта. Это демонстрация, не результат дорожной
                      маршрутизации.
                    </p>
                  </div>
                </section>
                <section className="panel data-panel">
                  <div className="panel-heading">
                    <h2>Пробег каждого инженера</h2>
                    <span className="muted">км · без возврата на базу</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Инженер</th>
                          <th>Базовый план</th>
                          <th>Предложенный план</th>
                          <th>Разница</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.engineers.map((e) => {
                          const a =
                              plans.baseline.routes.find(
                                (r) => r.engineerId === e.id,
                              )?.km ?? 0,
                            b =
                              plan?.routes.find((r) => r.engineerId === e.id)
                                ?.km ?? 0;
                          return (
                            <tr key={e.id}>
                              <td>
                                <span className="inline-engineer">
                                  <Avatar engineer={e} small />
                                  {e.name}
                                </span>
                              </td>
                              <td>{fmt(a)}</td>
                              <td>{fmt(b)}</td>
                              <td className={b < a ? "positive" : ""}>
                                {b < a && <ArrowDown size={13} />} {fmt(b - a)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
                {previous && (
                  <section className="panel data-panel">
                    <div className="panel-heading">
                      <h2>Изменения после срочной заявки</h2>
                      <span className="badge amber">Событие в {eventAt}</span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Заявка</th>
                            <th>Было</th>
                            <th>Стало</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changes.map((id) => {
                            const oldRoute = routeFor(id, previous),
                              newRoute = routeFor(id),
                              oldStop = oldRoute?.stops.find(
                                (s) => s.jobId === id,
                              ),
                              newStop = newRoute?.stops.find(
                                (s) => s.jobId === id,
                              );
                            return (
                              <tr key={id}>
                                <td>
                                  <button
                                    className="job-link"
                                    onClick={() => selectJob(id)}
                                  >
                                    № {id}
                                  </button>
                                </td>
                                <td>
                                  {oldStop
                                    ? `${engineerFor(id, previous)?.name} · ${clock(oldStop.start)}`
                                    : id === urgentJob.id
                                      ? "Новая заявка"
                                      : "Не назначена"}
                                </td>
                                <td>
                                  {newStop
                                    ? `${engineerFor(id)?.name} · ${clock(newStop.start)}`
                                    : "Не назначена"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            ) : (
              <section className="panel empty-state">
                <ChartNoAxesCombined size={34} />
                <h2>Сначала построим план</h2>
                <p>После расчёта здесь появится сравнение двух вариантов.</p>
                <button
                  className="button primary"
                  onClick={generate}
                  disabled={busy}
                >
                  Построить план
                </button>
              </section>
            ))}
          <footer className="page-footer">
            <span>
              Контур <b>·</b> помощник диспетчера
            </span>
            <span>
              Демонстрационные данные и расчёты <span className="status-dot" />
            </span>
          </footer>
        </div>
      </main>

      {selected && (
        <div
          className="drawer-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(undefined);
          }}
        >
          <aside
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className="detail-drawer"
            aria-label={`Заявка ${selected.id}`}
          >
            <div className="drawer-header">
              <button
                className="text-button"
                onClick={() => setSelectedId(undefined)}
              >
                <ArrowLeft size={16} /> Назад к плану
              </button>
              <button
                className="icon-btn"
                aria-label="Закрыть заявку"
                onClick={() => setSelectedId(undefined)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="drawer-body">
              <div className="eyebrow">ЗАЯВКА № {selected.id}</div>
              <h2>{selected.title}</h2>
              <p className="detail-address">
                <Navigation size={16} />
                {selected.address}
              </p>
              <div className="detail-badges">
                <span
                  className={`badge ${selectedEngineer ? "green" : plan ? "amber" : "gray"}`}
                >
                  {selectedEngineer
                    ? "Назначена"
                    : plan
                      ? "Не назначена"
                      : "Готова к планированию"}
                </span>
                {selected.priority === "urgent" && (
                  <span className="badge red">
                    <Zap size={12} />
                    Срочная
                  </span>
                )}
                {changes.includes(selected.id) && (
                  <span className="badge purple">План изменился</span>
                )}
              </div>
              <div className="detail-facts">
                <div>
                  <span>Окно начала работ</span>
                  <b>{selected.window.join(" — ")}</b>
                </div>
                <div>
                  <span>Длительность</span>
                  <b>{selected.duration} минут</b>
                </div>
                <div>
                  <span>Навык</span>
                  <b>{skillNames[selected.skill]}</b>
                </div>
                <div>
                  <span>Транспорт</span>
                  <b>
                    {selected.transport
                      ? transportNames[selected.transport]
                      : "Без ограничений"}
                  </b>
                </div>
              </div>
              {selectedEngineer && selectedStop ? (
                <>
                  <h3>Исполнитель</h3>
                  <div className="assigned-engineer">
                    <Avatar engineer={selectedEngineer} />
                    <div>
                      <b>{selectedEngineer.name}</b>
                      <small>
                        {transportNames[selectedEngineer.transport]}
                      </small>
                    </div>
                    <Check size={18} />
                  </div>
                  <div className="visit-times">
                    <div>
                      <span>Прибытие</span>
                      <b>{clock(selectedStop.arrival)}</b>
                    </div>
                    <ChevronRight size={15} />
                    <div>
                      <span>Начало</span>
                      <b>{clock(selectedStop.start)}</b>
                    </div>
                    <ChevronRight size={15} />
                    <div>
                      <span>Завершение</span>
                      <b>{clock(selectedStop.end)}</b>
                    </div>
                  </div>
                  <div className="explanation">
                    <div>
                      <Sparkles size={18} />
                      <h3>Почему этот инженер?</h3>
                    </div>
                    <p>
                      У {selectedEngineer.name.split(" ")[0]} есть навык «
                      {skillNames[selected.skill]}»
                      {selected.transport
                        ? ` и нужный транспорт: ${transportNames[selected.transport].toLowerCase()}`
                        : ""}
                      .
                    </p>
                    <ul>
                      <li>
                        Начало в {clock(selectedStop.start)} попадает в окно{" "}
                        {selected.window.join("–")}.
                      </li>
                      <li>
                        Дорога от предыдущей точки: {selectedStop.travel} мин,{" "}
                        {fmt(selectedStop.km)} км.
                      </li>
                      <li>
                        Работа заканчивается до конца смены в{" "}
                        {selectedEngineer.shift[1]}.
                      </li>
                    </ul>
                    <p className="explanation-small">
                      При выборе плана сравниваем число назначений, затем число
                      исполнителей и общий пробег. Это допустимый вариант,
                      математический оптимум не гарантируется.
                    </p>
                  </div>
                  <button
                    className="button secondary full"
                    onClick={() => {
                      setEngineerId(selectedEngineer.id);
                      setPage("workspace");
                      setSelectedId(undefined);
                    }}
                  >
                    Показать маршрут инженера <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <div className="explanation warning">
                  <div>
                    <TriangleAlert size={18} />
                    <h3>
                      {plan ? "Почему не назначена?" : "Что будет дальше?"}
                    </h3>
                  </div>
                  <p>
                    {unassigned?.reason ??
                      "Постройте план — здесь появится исполнитель и объяснение назначения."}
                  </p>
                  {unassigned && (
                    <p className="explanation-small">
                      Проверьте доступность подходящего инженера и требования
                      заявки перед изменением данных.
                    </p>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {modal === "import" && (
        <Modal
          title="Начнём с данных"
          subtitle="Загрузите рабочий день или используйте готовый демонстрационный набор."
          onClose={closeModal}
        >
          <label className="upload-zone">
            <Upload size={28} />
            <b>Выберите JSON с заявками и инженерами</b>
            <span>До 100 заявок · до 2 МБ</span>
            <input
              type="file"
              accept=".json,application/json"
              aria-label="Загрузить JSON"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </label>
          <button
            className="text-button"
            onClick={() => Download(demo, "demo-dataset.json")}
          >
            <ArrowDownToLine size={16} /> Скачать пример структуры
          </button>
          <div className="import-note">
            <CircleHelp size={17} />
            <p>
              Исходные CSV хакатона нужно предварительно дополнить длительностью
              работ, координатами, навыками и данными инженеров. В этом
              прототипе импортируется единый JSON.
            </p>
          </div>
          {plan && (
            <p className="small muted">
              Загрузка нового набора сбросит текущий план.
            </p>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button
            className="button primary full"
            onClick={() => reset(structuredClone(demo))}
          >
            <Sparkles size={16} /> Открыть демонабор · 12 заявок, 5 инженеров
          </button>
        </Modal>
      )}
      {modal === "event" && (
        <Modal
          title={
            eventExists
              ? "Событие уже обработано"
              : "В течение дня всё меняется"
          }
          subtitle={
            eventExists
              ? "Сравните новый план с предыдущим или начните демонстрацию заново."
              : "Добавим срочную заявку и перестроим оставшуюся часть дня."
          }
          onClose={closeModal}
        >
          {eventExists ? (
            <>
              <div className="event-card">
                <CheckCheck size={22} />
                <div>
                  <b>Срочная заявка № SOS-01 учтена</b>
                  <p>Изменения доступны в разделе «Эффективность».</p>
                </div>
              </div>
              <button
                className="button primary full"
                onClick={() => {
                  setModal(null);
                  setPage("compare");
                }}
              >
                Посмотреть изменения <ArrowRight size={16} />
              </button>
              <button
                className="button secondary full"
                onClick={() => reset(structuredClone(demo))}
              >
                <RefreshCw size={15} /> Начать демо заново
              </button>
            </>
          ) : (
            <>
              <div className="event-card">
                <Zap size={22} />
                <div>
                  <b>Нет связи в офисе</b>
                  <p>{urgentJob.address}</p>
                  <span className="badge red">
                    Аварийные работы · автомобиль
                  </span>
                </div>
              </div>
              <div className="form-grid">
                <label>
                  Время события
                  <input
                    type="time"
                    value={eventAt}
                    onChange={(e) => setEventAt(e.target.value)}
                  />
                </label>
                <label>
                  Длительность, мин
                  <input
                    type="number"
                    min="1"
                    max="240"
                    value={eventDuration}
                    onChange={(e) => setEventDuration(Number(e.target.value))}
                  />
                </label>
                <label>
                  Начало окна
                  <input
                    type="time"
                    value={eventWindow[0]}
                    onChange={(e) =>
                      setEventWindow([e.target.value, eventWindow[1]])
                    }
                  />
                </label>
                <label>
                  Конец окна
                  <input
                    type="time"
                    value={eventWindow[1]}
                    onChange={(e) =>
                      setEventWindow([eventWindow[0], e.target.value])
                    }
                  />
                </label>
              </div>
              <div className="import-note">
                <ShieldCheck size={19} />
                <p>
                  Работы, начавшиеся до времени события, сохранятся. Для
                  остальных заявок покажем новые назначения и время.
                </p>
              </div>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button
                className="button primary full"
                disabled={busy}
                onClick={replan}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <RefreshCw size={17} />
                )}{" "}
                {busy ? "Перестраиваем…" : "Добавить и перестроить план"}
              </button>
            </>
          )}
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Один день. Пять шагов."
          subtitle="Сценарий демонстрации помощника диспетчера"
          onClose={closeModal}
        >
          <ol className="help-steps">
            <li>
              <b>Откройте данные</b>
              <span>Заявки, окна, навыки и транспорт инженеров.</span>
            </li>
            <li>
              <b>Постройте план</b>
              <span>Посмотрите маршруты и расписание команды.</span>
            </li>
            <li>
              <b>Откройте заявку</b>
              <span>
                Проверьте объяснение назначения. Разберите конфликт с велозоной.
              </span>
            </li>
            <li>
              <b>Добавьте срочное событие</b>
              <span>Увидите, как меняются оставшиеся выезды.</span>
            </li>
            <li>
              <b>Сравните эффективность</b>
              <span>Число инженеров и пробег по каждому маршруту.</span>
            </li>
          </ol>
          <button className="button primary full" onClick={closeModal}>
            Перейти к рабочему дню <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  icon,
  detail,
  warning,
  onClick,
}: {
  label: string;
  value: string;
  suffix?: string;
  icon: ReactNode;
  detail: string;
  warning?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`stat-card ${warning ? "warning" : ""} ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">
        {value} <span>{suffix}</span>
      </div>
      <div className="stat-detail">
        {warning && <span className="warning-dot" />}
        {detail}
        {onClick && <ArrowUpRight size={14} />}
      </div>
    </button>
  );
}
function Timeline({
  data,
  plan,
  onSelect,
}: {
  data: Dataset;
  plan?: Plan;
  onSelect: (id: string) => void;
}) {
  if (!plan)
    return (
      <div className="empty-state timeline-empty">
        <Clock3 size={32} />
        <h3>Расписание появится после расчёта</h3>
        <p>Постройте план, чтобы увидеть время каждого выезда.</p>
      </div>
    );
  const from = Math.min(...data.engineers.map((e) => minutes(e.shift[0]))),
    to = Math.max(...data.engineers.map((e) => minutes(e.shift[1]))),
    range = Math.max(to - from, 1);
  return (
    <div className="timeline-scroll">
      <div className="timeline">
        <div className="timeline-scale">
          <span />
          {Array.from({ length: 7 }, (_, i) => (
            <small key={i}>{clock(from + Math.floor((range * i) / 6))}</small>
          ))}
        </div>
        {data.engineers.map((e) => {
          const r = plan.routes.find((r) => r.engineerId === e.id);
          return (
            <div className="timeline-row" key={e.id}>
              <div>
                <Avatar engineer={e} small />
                <span>{e.name.split(" ")[0]}</span>
              </div>
              <div className="timeline-lane">
                {r?.stops.map((s) => (
                  <button
                    key={s.jobId}
                    style={{
                      left: `${((s.start - from) / range) * 100}%`,
                      width: `${((s.end - s.start) / range) * 100}%`,
                      background: e.color,
                    }}
                    title={`№ ${s.jobId}: ${clock(s.start)}–${clock(s.end)}`}
                    aria-label={`Заявка ${s.jobId}, начало ${clock(s.start)}`}
                    onClick={() => onSelect(s.jobId)}
                  >
                    {s.jobId}
                  </button>
                ))}
                {!r?.stops.length && <span className="muted">В резерве</span>}
              </div>
            </div>
          );
        })}
        <p className="timeline-note">
          Цветные блоки — работы. Промежутки включают дорогу и ожидание
          временного окна.
        </p>
      </div>
    </div>
  );
}
