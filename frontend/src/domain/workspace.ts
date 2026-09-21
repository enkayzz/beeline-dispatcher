import type { Dataset, Job, Plan, Stop } from "../types";
import { demo } from "../demo";
import { parseDataset } from "../validation";

export type Role = "support" | "dispatcher";
export const dayKeys = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type DayKey = (typeof dayKeys)[number];
export const dayNames: Record<DayKey, string> = {
  mon: "Пн",
  tue: "Вт",
  wed: "Ср",
  thu: "Чт",
  fri: "Пт",
  sat: "Сб",
  sun: "Вс",
};
export interface WorkDay {
  enabled: boolean;
  start: string;
  end: string;
}
export interface UnavailablePeriod {
  id: string;
  date: string;
  from: string;
  to: string;
  note: string;
}
export interface EngineerSettings {
  canSelfEdit: boolean;
  weekly: Record<DayKey, WorkDay>;
  unavailable: UnavailablePeriod[];
}
export type Status =
  | "new"
  | "assigned"
  | "enroute"
  | "in_progress"
  | "review"
  | "completed"
  | "cancelled";
export const statusNames: Record<Status, string> = {
  new: "Новая",
  assigned: "Назначена",
  enroute: "В пути",
  in_progress: "В работе",
  review: "Ожидает закрытия",
  completed: "Завершена",
  cancelled: "Отменена",
};
export type WorkType = "connection" | "emergency" | "local" | "equipment";
export const workNames: Record<WorkType, string> = {
  connection: "Подключение",
  emergency: "Авария",
  local: "Ремонт",
  equipment: "Дозаказ оборудования",
};
// Technical work + paperwork. The 20 minute travel allowance is replaced by route travel.
export const serviceMinutes: Record<WorkType, number> = {
  connection: 70,
  emergency: 80,
  local: 30,
  equipment: 20,
};
export interface TicketInfo {
  lastAssignment?: { engineerId: string; stop: Stop };
  owner: string;
  status: Status;
  progress: number;
  contact: string;
  note: string;
  workType: WorkType;
  routers: number;
  receivedAt: string;
}
export interface Assignment {
  engineerId: string;
  start: string;
}
export interface Audit {
  at: string;
  actor: string;
  text: string;
  jobId?: string;
}
export interface Workspace {
  days?: Record<string, Omit<Workspace, "days">>;
  supportEngineerId?: string;
  version: 3;
  data: Dataset;
  tickets: Record<string, TicketInfo>;
  manual: Record<string, Assignment>;
  stock: Record<string, number>;
  engineerSettings: Record<string, EngineerSettings>;
  current?: Plan;
  optimized?: Plan;
  baseline?: Plan;
  history: Audit[];
}
export const actorNames: Record<Role, string> = {
  support: "Анна · поддержка",
  dispatcher: "Дмитрий · диспетчер",
};
export const ownerNames: Record<string, string> = {
  "support-1": "Анна Белова",
  "support-2": "Иван Петров",
};
export function createWorkspace(
  data: Dataset = structuredClone(demo),
): Workspace {
  const tickets: Workspace["tickets"] = {};
  for (const [i, job] of data.jobs.entries()) {
    tickets[job.id] = {
      owner: i % 3 === 0 ? "support-2" : "support-1",
      status: "new",
      progress: 0,
      contact: "",
      note: "",
      workType: job.skill,
      routers: job.skill === "connection" ? 1 : 0,
      receivedAt: "09:00",
    };
    job.duration = serviceMinutes[job.skill];
    if (job.skill === "emergency") job.priority = "urgent";
  }
  return {
    version: 3,
    supportEngineerId:
      data.engineers.find((e) => e.id === "e4")?.id ?? data.engineers[0]?.id,
    data,
    tickets,
    manual: {},
    stock: Object.fromEntries(data.engineers.map((e) => [e.id, 4])),
    engineerSettings: Object.fromEntries(
      data.engineers.map((e, index) => [
        e.id,
        {
          ...defaultEngineerSettings(e.shift, index < 2 || e.id === "e4"),
          weekly: {
            ...defaultEngineerSettings(e.shift).weekly,
            [dayKey(data.date)]: {
              enabled: e.shift[0] < e.shift[1],
              start: e.shift[0],
              end: e.shift[1],
            },
          },
        },
      ]),
    ),
    history: [],
  };
}
export const STORAGE_KEY = "kontur-workspace-v3";
export function supportId(w: Workspace) {
  return (
    w.supportEngineerId ??
    w.data.engineers.find((e) => e.id === "e4")?.id ??
    w.data.engineers[0]?.id
  );
}
export function personalStops(w: Workspace) {
  const employeeId = supportId(w);
  if (!employeeId) return [];
  const stops = [
    ...(w.current?.routes.find((r) => r.engineerId === employeeId)?.stops ??
      []),
  ];
  for (const job of w.data.jobs) {
    const info = w.tickets[job.id];
    if (
      info.status === "cancelled" &&
      info.lastAssignment?.engineerId === employeeId &&
      !stops.some((s) => s.jobId === job.id)
    ) {
      stops.push(info.lastAssignment.stop);
    }
  }
  return stops.sort((a, b) => a.start - b.start);
}
export function personalJobs(w: Workspace) {
  const ids = new Set(personalStops(w).map((stop) => stop.jobId));
  return w.data.jobs.filter((job) => ids.has(job.id));
}
export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function switchDay(w: Workspace, date: string): Workspace {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
    shiftDate(date, 0) !== date
  )
    throw new Error("Выберите корректную дату.");
  if (date === w.data.date) return w;
  const { days = {}, ...current } = structuredClone(w);
  const archive = { ...days, [w.data.date]: current };
  const existing = archive[date];
  delete archive[date];
  if (existing)
    return { ...existing, supportEngineerId: supportId(w), days: archive };
  return { ...dayAt(w, date), days: archive };
}
/** Read-only view also used by both weekly calendars for unsaved dates. */
export function dayAt(w: Workspace, date: string): Workspace {
  if (date === w.data.date) return w;
  if (w.days?.[date])
    return { ...w.days[date], supportEngineerId: supportId(w) };
  const archive = { ...w.days, [w.data.date]: w };
  const sourceDate =
    Object.keys(archive)
      .filter((key) => key <= date)
      .sort()
      .at(-1) ?? Object.keys(archive).sort()[0];
  const source = archive[sourceDate] ?? w;
  const data = structuredClone(source.data);
  data.date = date;
  data.jobs = [];
  const next = createWorkspace(data);
  next.supportEngineerId = supportId(w);
  next.stock = structuredClone(source.stock);
  next.engineerSettings = structuredClone(source.engineerSettings);
  for (const employee of next.data.engineers) {
    const shift = engineerSettingsFor(next, employee.id).weekly[dayKey(date)];
    employee.shift = shift.enabled
      ? [shift.start, shift.end]
      : ["00:00", "00:00"];
  }
  return next;
}
export function importDay(w: Workspace, imported: Workspace): Workspace {
  const { days = {}, ...current } = structuredClone(w);
  const archive = { ...days, [w.data.date]: current };
  delete archive[imported.data.date];
  return { ...imported, days: archive };
}
export function defaultEngineerSettings(
  shift: [string, string],
  canSelfEdit = false,
): EngineerSettings {
  return {
    canSelfEdit,
    weekly: Object.fromEntries(
      dayKeys.map((day, index) => [
        day,
        { enabled: index < 5, start: shift[0], end: shift[1] },
      ]),
    ) as Record<DayKey, WorkDay>,
    unavailable: [],
  };
}
export function dayKey(date: string): DayKey {
  const jsDay = new Date(`${date}T12:00:00`).getDay();
  return dayKeys[(jsDay + 6) % 7];
}
export function engineerSettingsFor(w: Workspace, engineerId: string) {
  const engineer = w.data.engineers.find((e) => e.id === engineerId);
  return (
    w.engineerSettings[engineerId] ??
    defaultEngineerSettings(engineer?.shift ?? ["09:00", "18:00"])
  );
}
function migrateSupportTerminology(value: string) {
  const replacements: [string, string][] = [
    ["Инженерами", "Специалистами поддержки"],
    ["инженерами", "специалистами поддержки"],
    ["Инженеров", "Специалистов поддержки"],
    ["инженеров", "специалистов поддержки"],
    ["Инженерам", "Специалистам поддержки"],
    ["инженерам", "специалистам поддержки"],
    ["Инженерах", "Специалистах поддержки"],
    ["инженерах", "специалистах поддержки"],
    ["Инженером", "Специалистом поддержки"],
    ["инженером", "специалистом поддержки"],
    ["Инженеру", "Специалисту поддержки"],
    ["инженеру", "специалисту поддержки"],
    ["Инженера", "Специалиста поддержки"],
    ["инженера", "специалиста поддержки"],
    ["Инженеры", "Специалисты поддержки"],
    ["инженеры", "специалисты поддержки"],
    ["Инженер", "Специалист поддержки"],
    ["инженер", "специалист поддержки"],
  ];
  return replacements.reduce(
    (result, [from, to]) => result.replaceAll(from, to),
    value,
  );
}
function migrateSavedTerminology(saved: Workspace) {
  for (const plan of [saved.current, saved.optimized, saved.baseline]) {
    for (const item of plan?.unassigned ?? []) {
      item.reason = migrateSupportTerminology(item.reason);
    }
  }
  for (const item of saved.history) {
    item.actor = migrateSupportTerminology(item.actor);
    item.text = migrateSupportTerminology(item.text);
  }
  for (const employee of saved.data.engineers) {
    employee.role = migrateSupportTerminology(employee.role);
  }
  return saved;
}
export function loadWorkspace(): Workspace {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "null",
    ) as Workspace | null;
    if (
      saved?.version === 3 &&
      saved.tickets &&
      saved.manual &&
      saved.stock &&
      saved.engineerSettings &&
      Array.isArray(saved.history)
    ) {
      parseDataset(JSON.stringify(saved.data));
      if (
        saved.data.jobs.every(
          (j) =>
            saved.tickets[j.id] && saved.tickets[j.id].status in statusNames,
        )
      ) {
        saved.supportEngineerId ??= supportId(saved);
        for (const [date, day] of Object.entries(saved.days ?? {})) {
          parseDataset(JSON.stringify(day.data));
          if (
            day.data.date !== date ||
            !day.data.jobs.every(
              (job) => day.tickets[job.id]?.status in statusNames,
            )
          )
            throw new Error("Некорректный сохранённый день.");
          migrateSavedTerminology(day);
        }
        return migrateSavedTerminology(saved);
      }
    }
  } catch {
    /* Invalid / older local state starts with the demo. */
  }
  return createWorkspace();
}
export function audit(w: Workspace, role: Role, text: string, jobId?: string) {
  w.history.unshift({
    at: new Date().toISOString(),
    actor:
      role === "support"
        ? `${w.data.engineers.find((e) => e.id === supportId(w))?.name ?? "Сотрудник"} · поддержка`
        : actorNames[role],
    text,
    jobId,
  });
  w.history = w.history.slice(0, 200);
}
export function locked(status: Status) {
  return ["enroute", "in_progress", "review", "completed"].includes(status);
}
export function ticketStatus(w: Workspace, job: Job): Status {
  const status = w.tickets[job.id].status;
  if (status === "new" || status === "assigned")
    return w.current?.routes.some((r) =>
      r.stops.some((s) => s.jobId === job.id),
    )
      ? "assigned"
      : "new";
  return status;
}
export function assignmentFor(plan: Plan | undefined, id: string) {
  for (const route of plan?.routes ?? []) {
    const stop = route.stops.find((s) => s.jobId === id);
    if (stop) return { engineerId: route.engineerId, stop };
  }
}
