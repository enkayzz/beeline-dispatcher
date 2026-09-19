export type Skill = "local" | "connection" | "emergency";
export type Transport = "car" | "walk" | "bike" | "transit";
export type Point = [number, number];
export interface Job {
  id: string;
  title: string;
  address: string;
  point: Point;
  duration: number;
  window: [string, string];
  priority: "normal" | "urgent";
  skill: Skill;
  transport?: Transport;
}
export interface Engineer {
  id: string;
  name: string;
  role: string;
  color: string;
  start: Point;
  shift: [string, string];
  skills: Skill[];
  transport: Transport;
}
export interface Dataset {
  name: string;
  date: string;
  jobs: Job[];
  engineers: Engineer[];
}
export interface Stop {
  jobId: string;
  arrival: number;
  start: number;
  end: number;
  travel: number;
  km: number;
}
export interface Route {
  engineerId: string;
  stops: Stop[];
  km: number;
}
export interface Unassigned {
  jobId: string;
  reason: string;
}
export interface Plan {
  id: string;
  routes: Route[];
  unassigned: Unassigned[];
  metrics: { assigned: number; engineers: number; km: number; travel: number };
}
export interface PlanPair {
  baseline: Plan;
  optimized: Plan;
}
export interface ReplanResult {
  dataset: Dataset;
  plans: PlanPair;
  previous: Plan;
  changedIds: string[];
}
export interface DispatchApi {
  plan(data: Dataset): Promise<PlanPair>;
  replan(
    data: Dataset,
    previous: Plan,
    event: { type: "urgent"; at: string; job: Job },
  ): Promise<ReplanResult>;
}
export const skillNames: Record<Skill, string> = {
  local: "Локальные работы",
  connection: "Подключение",
  emergency: "Аварийные работы",
};
export const transportNames: Record<Transport, string> = {
  car: "Автомобиль",
  walk: "Пешком",
  bike: "Велосипед",
  transit: "Общ. транспорт",
};
