import type { Engineer, Job, Plan, Route, Stop } from "../types";
import { clock, distance, minutes } from "../api";
import {
  assignmentFor,
  locked,
  type Assignment,
  type Workspace,
} from "./workspace";
const speeds = { car: 28, walk: 5, bike: 15, transit: 18 };
const travelBetween = (e: Engineer, a: Job["point"], b: Job["point"]) => {
  const km = distance(a, b);
  return { km, travel: Math.ceil((km / speeds[e.transport]) * 60) };
};
const rank = (w: Workspace, j: Job) =>
  w.tickets[j.id].workType === "emergency"
    ? 0
    : w.tickets[j.id].workType === "connection"
      ? 1
      : 2;

/** Build fixed appointments first, then insert remaining jobs into feasible gaps.
 * Actual enroute/started/completed work is preserved as a route prefix, never optimized anew.
 */
export function solve(
  w: Workspace,
  manual: Record<string, Assignment> = {},
  baseline = false,
): Plan {
  const { data } = w;
  const jobs = new Map(data.jobs.map((j) => [j.id, j]));
  const routes: Route[] = data.engineers.map((e) => ({
    engineerId: e.id,
    stops: [],
    km: 0,
  }));
  const used = new Set<string>();
  const immutable = new Set<string>();
  const resources = new Map(
    data.engineers.map((e) => [e.id, w.stock[e.id] ?? 0]),
  );
  const reasons: Plan["unassigned"] = [];
  for (const route of routes) {
    const prev = w.current?.routes.find(
      (r) => r.engineerId === route.engineerId,
    );
    let lastLocked = -1;
    prev?.stops.forEach((s, i) => {
      if (w.tickets[s.jobId] && locked(w.tickets[s.jobId].status))
        lastLocked = i;
    });
    if (lastLocked >= 0 && prev) {
      for (const s of prev.stops.slice(0, lastLocked + 1)) {
        if (w.tickets[s.jobId].status === "cancelled") continue;
        route.stops.push({ ...s });
        used.add(s.jobId);
        immutable.add(s.jobId);
        resources.set(
          route.engineerId,
          resources.get(route.engineerId)! - w.tickets[s.jobId].routers,
        );
      }
    }
  }
  const compatible = (e: Engineer, j: Job) =>
    e.skills.includes(j.skill) && (!j.transport || e.transport === j.transport);
  function place(
    e: Engineer,
    route: Route,
    j: Job,
    exact?: number,
  ): Stop[] | undefined {
    if (!compatible(e, j) || resources.get(e.id)! < w.tickets[j.id].routers)
      return;
    const earliest = Math.max(
      minutes(j.window[0]),
      minutes(w.tickets[j.id].receivedAt),
    );
    for (let i = 0; i <= route.stops.length; i++) {
      // No insertion into a prefix containing factually started work.
      if (route.stops.slice(i).some((s) => immutable.has(s.jobId))) continue;
      const previous = route.stops[i - 1],
        next = route.stops[i];
      const segment = travelBetween(
        e,
        previous ? jobs.get(previous.jobId)!.point : e.start,
        j.point,
      );
      const arrival =
        Math.max(
          previous?.end ?? minutes(e.shift[0]),
          minutes(w.tickets[j.id].receivedAt),
        ) + segment.travel;
      const start = exact ?? Math.max(arrival, earliest);
      const end = start + j.duration;
      if (
        start < arrival ||
        start < earliest ||
        start > minutes(j.window[1]) ||
        end > minutes(e.shift[1])
      )
        continue;
      const nextSegment =
        next && travelBetween(e, j.point, jobs.get(next.jobId)!.point);
      const nextArrival =
        next && nextSegment
          ? Math.max(end, minutes(w.tickets[next.jobId].receivedAt)) +
            nextSegment.travel
          : 0;
      if (next && nextArrival > next.start) continue;
      const stops = route.stops.map((s) => ({ ...s }));
      if (next && nextSegment)
        stops[i] = {
          ...next,
          ...nextSegment,
          arrival: nextArrival,
        };
      stops.splice(i, 0, { jobId: j.id, arrival, start, end, ...segment });
      return stops;
    }
  }
  const fixed = Object.entries(manual).sort(
    (a, b) => minutes(a[1].start) - minutes(b[1].start),
  );
  for (const [id, assignment] of fixed) {
    const j = jobs.get(id);
    if (!j || w.tickets[id].status === "cancelled") continue;
    if (used.has(id)) {
      const factual = assignmentFor(w.current, id);
      if (
        factual?.engineerId !== assignment.engineerId ||
        clock(factual.stop.start) !== assignment.start
      )
        throw new Error("Начатые и завершённые работы нельзя перемещать.");
      continue;
    }
    const e = data.engineers.find((e) => e.id === assignment.engineerId);
    const route = routes.find((r) => r.engineerId === e?.id);
    if (!e || !route) throw new Error("Инженер не найден.");
    if (!compatible(e, j))
      throw new Error(
        `Заявка № ${id}: у инженера нет нужного навыка или транспорта.`,
      );
    if (resources.get(e.id)! < w.tickets[id].routers)
      throw new Error(`Заявка № ${id}: недостаточно роутеров у инженера.`);
    const placed = place(e, route, j, minutes(assignment.start));
    if (!placed)
      throw new Error(
        `Заявка № ${id}: выбранное время конфликтует с дорогой, окном клиента, другой работой или сменой.`,
      );
    route.stops = placed;
    used.add(id);
    resources.set(e.id, resources.get(e.id)! - w.tickets[id].routers);
  }
  const order = [...data.jobs].filter(
    (j) => w.tickets[j.id].status !== "cancelled" && !used.has(j.id),
  );
  if (!baseline)
    order.sort(
      (a, b) =>
        rank(w, a) - rank(w, b) ||
        minutes(a.window[1]) - minutes(b.window[1]) ||
        a.id.localeCompare(b.id),
    );
  for (const j of order) {
    // Completed jobs without historical assignment are excluded, not scheduled as new work.
    if (w.tickets[j.id].status === "completed") continue;
    const candidates = routes
      .flatMap((route, index) => {
        const e = data.engineers[index],
          stops = place(e, route, j);
        if (!stops) return [];
        const delta =
          stops.reduce((n, s) => n + s.km, 0) -
          route.stops.reduce((n, s) => n + s.km, 0);
        return [
          {
            route,
            stops,
            cost: baseline ? index : (route.stops.length ? 0 : 10000) + delta,
          },
        ];
      })
      .sort((a, b) => a.cost - b.cost);
    const best = candidates[0];
    if (best) {
      best.route.stops = best.stops;
      resources.set(
        best.route.engineerId,
        resources.get(best.route.engineerId)! - w.tickets[j.id].routers,
      );
    } else {
      const skilled = data.engineers.filter((e) => e.skills.includes(j.skill));
      const allowed = skilled.filter((e) => compatible(e, j));
      const equipped = allowed.filter(
        (e) => resources.get(e.id)! >= w.tickets[j.id].routers,
      );
      reasons.push({
        jobId: j.id,
        reason: !skilled.length
          ? "Нет инженера с нужным навыком."
          : !allowed.length
            ? "У подходящих инженеров нет требуемого транспорта."
            : !equipped.length
              ? "Недостаточно оборудования. Скорректируйте запас бригады или требование заявки."
              : "Не найден свободный интервал с учётом дороги, окна, смены и фиксированных назначений.",
      });
    }
  }
  routes.forEach((r) => {
    r.km = r.stops.reduce((n, s) => n + s.km, 0);
  });
  return {
    id: baseline
      ? "baseline"
      : Object.keys(manual).length
        ? "manual"
        : "optimized",
    routes,
    unassigned: reasons,
    metrics: {
      assigned: routes.reduce((n, r) => n + r.stops.length, 0),
      engineers: routes.filter((r) => r.stops.length).length,
      km: routes.reduce((n, r) => n + r.km, 0),
      travel: routes.flatMap((r) => r.stops).reduce((n, s) => n + s.travel, 0),
    },
  };
}
export function recalculate(w: Workspace): Workspace {
  // Compare identical data, inventory and factual work; only manual constraints differ.
  const current = solve(w, w.manual);
  const optimized = solve(w);
  const baseline = solve(w, {}, true);
  return { ...w, current, optimized, baseline };
}
