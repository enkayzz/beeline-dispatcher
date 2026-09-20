import type { Dataset, Job, Plan } from "../types";
import { demo } from "../demo";
import { parseDataset } from "../validation";

export type Role = "support" | "dispatcher";
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
  version: 2;
  data: Dataset;
  tickets: Record<string, TicketInfo>;
  manual: Record<string, Assignment>;
  stock: Record<string, number>;
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
  "support-1": "Анна Смирнова",
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
    version: 2,
    data,
    tickets,
    manual: {},
    stock: Object.fromEntries(data.engineers.map((e) => [e.id, 4])),
    history: [],
  };
}
export const STORAGE_KEY = "kontur-workspace-v2";
export function loadWorkspace(): Workspace {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "null",
    ) as Workspace | null;
    if (
      saved?.version === 2 &&
      saved.tickets &&
      saved.manual &&
      saved.stock &&
      Array.isArray(saved.history)
    ) {
      parseDataset(JSON.stringify(saved.data));
      if (
        saved.data.jobs.every(
          (j) =>
            saved.tickets[j.id] && saved.tickets[j.id].status in statusNames,
        )
      )
        return saved;
    }
  } catch {
    /* Invalid / older local state starts with the demo. */
  }
  return createWorkspace();
}
export function audit(w: Workspace, role: Role, text: string, jobId?: string) {
  w.history.unshift({
    at: new Date().toISOString(),
    actor: actorNames[role],
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
