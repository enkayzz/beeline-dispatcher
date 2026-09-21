import type {
  Dataset,
  DispatchApi,
  Engineer,
  Job,
  Plan,
  PlanPair,
  Point,
  Route,
  Stop,
} from "./types";

export const minutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
export const clock = (value: number) =>
  `${Math.floor(value / 60)
    .toString()
    .padStart(2, "0")}:${Math.round(value % 60)
    .toString()
    .padStart(2, "0")}`;
export const distance = (a: Point, b: Point) => {
  const rad = Math.PI / 180;
  const d =
    Math.sin(((b[0] - a[0]) * rad) / 2) ** 2 +
    Math.cos(a[0] * rad) *
      Math.cos(b[0] * rad) *
      Math.sin(((b[1] - a[1]) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(d), Math.sqrt(1 - d));
};
const speed = { car: 28, walk: 5, bike: 15, transit: 18 };
const eligible = (e: Engineer, j: Job) =>
  e.skills.includes(j.skill) && (!j.transport || j.transport === e.transport);
type Seed = { previous: Plan; at: number };
function calculate(
  data: Dataset,
  order: Job[],
  mode: "baseline" | "candidate",
  seed?: Seed,
): Plan {
  const jobs = new Map(data.jobs.map((j) => [j.id, j]));
  const routes: Route[] = data.engineers.map((e) => {
    const frozen =
      seed?.previous.routes
        .find((r) => r.engineerId === e.id)
        ?.stops.filter((s) => s.start < seed.at) ?? [];
    return {
      engineerId: e.id,
      stops: frozen.map((s) => ({ ...s })),
      km: frozen.reduce((n, s) => n + s.km, 0),
    };
  });
  const frozenIds = new Set(routes.flatMap((r) => r.stops.map((s) => s.jobId)));
  const unassigned: Plan["unassigned"] = [];
  for (const j of order) {
    if (frozenIds.has(j.id)) continue;
    const candidates: { route: Route; stop: Stop; cost: number }[] = [];
    for (let index = 0; index < data.engineers.length; index++) {
      const e = data.engineers[index],
        route = routes[index];
      if (!eligible(e, j)) continue;
      const last = route.stops.at(-1);
      const origin = last ? jobs.get(last.jobId)!.point : e.start;
      const km = distance(origin, j.point);
      const travel = Math.ceil((km / speed[e.transport]) * 60);
      const arrival =
        Math.max(last?.end ?? minutes(e.shift[0]), seed?.at ?? 0) + travel;
      const start = Math.max(arrival, minutes(j.window[0]));
      const end = start + j.duration;
      if (start > minutes(j.window[1]) || end > minutes(e.shift[1])) continue;
      candidates.push({
        route,
        stop: { jobId: j.id, arrival, start, end, travel, km },
        cost:
          mode === "baseline"
            ? index
            : (route.stops.length ? 0 : 1000) + km + (start - arrival) * 0.008,
      });
    }
    candidates.sort((a, b) => a.cost - b.cost);
    const choice = candidates[0];
    if (choice) {
      choice.route.stops.push(choice.stop);
      choice.route.km += choice.stop.km;
    } else {
      const skilled = data.engineers.filter((e) => e.skills.includes(j.skill));
      const reason = !skilled.length
        ? "Нет специалиста поддержки с нужным навыком."
        : !skilled.some((e) => eligible(e, j))
          ? "У специалистов поддержки с нужным навыком нет требуемого транспорта."
          : "В этом плане не найден свободный интервал с учётом дороги, окна заявки и смены. Попробуйте изменить окно или состав команды.";
      unassigned.push({ jobId: j.id, reason });
    }
  }
  return {
    id: `demo-${mode}`,
    routes,
    unassigned,
    metrics: {
      assigned: routes.reduce((n, r) => n + r.stops.length, 0),
      engineers: routes.filter((r) => r.stops.length).length,
      km: routes.reduce((n, r) => n + r.km, 0),
      travel: routes.flatMap((r) => r.stops).reduce((n, s) => n + s.travel, 0),
    },
  };
}
const score = (p: Plan) =>
  -p.metrics.assigned * 1e7 + p.metrics.engineers * 1e5 + p.metrics.km;
export function buildPlans(data: Dataset, seed?: Seed): PlanPair {
  const baseline = calculate(data, data.jobs, "baseline", seed);
  let best = baseline;
  // Small deterministic local heuristic for the UI demo; replace with server solver.
  const normal = [...data.jobs].sort(
    (a, b) => minutes(a.window[1]) - minutes(b.window[1]),
  );
  const priority = (a: Job, b: Job) =>
    Number(b.priority === "urgent") - Number(a.priority === "urgent");
  const orders = [
    data.jobs,
    normal,
    [...normal].sort((a, b) => minutes(a.window[0]) - minutes(b.window[0])),
  ];
  let random = 42;
  for (let k = 0; k < 36; k++) {
    const order = [...normal];
    for (let i = order.length - 1; i > 0; i--) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const j = random % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    orders.push(order);
  }
  // A replan must actually prioritize the new urgent request.
  if (seed)
    best = calculate(data, [...normal].sort(priority), "candidate", seed);
  for (const order of orders) {
    const candidate = calculate(
      data,
      [...order].sort(priority),
      "candidate",
      seed,
    );
    if (score(candidate) < score(best)) best = candidate;
  }
  return { baseline, optimized: { ...best, id: "demo-optimized" } };
}
const delay = () => new Promise((resolve) => setTimeout(resolve, 650));
export const api: DispatchApi = {
  async plan(data) {
    await delay();
    return buildPlans(data);
  },
  async replan(data, previous, event) {
    await delay();
    if (data.jobs.some((j) => j.id === event.job.id))
      throw new Error("Заявка с таким ID уже существует.");
    const dataset = { ...data, jobs: [...data.jobs, event.job] };
    const plans = buildPlans(dataset, { previous, at: minutes(event.at) });
    const signatures = (p: Plan) =>
      new Map(
        p.routes.flatMap((r) =>
          r.stops.map((s, i) => [s.jobId, `${r.engineerId}/${i}/${s.start}`]),
        ),
      );
    const old = signatures(previous),
      next = signatures(plans.optimized);
    const changedIds = dataset.jobs
      .filter((j) => old.get(j.id) !== next.get(j.id))
      .map((j) => j.id);
    return { dataset, plans, previous, changedIds };
  },
};
