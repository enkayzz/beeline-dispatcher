import { createWorkspace, type Status } from "./workspace";
import { recalculate } from "./planner";
export type DemoPeriod = "morning" | "day" | "evening";
export const demoTimes = {
  morning: {
    label: "Утро",
    time: "09:00",
    hint: "Заявки поступили, распределите рабочий день",
  },
  day: {
    label: "День",
    time: "13:00",
    hint: "Часть работ закрыта, сотрудники на маршрутах",
  },
  evening: {
    label: "Вечер",
    time: "18:00",
    hint: "Итоги дня: выполненные работы и нерешённые заявки",
  },
};
export function demoSnapshot(period: DemoPeriod) {
  const initial = createWorkspace();
  if (period === "morning") return initial;
  const w = recalculate(initial);
  const now = period === "day" ? 780 : 1080;
  for (const route of w.current!.routes) {
    for (const stop of route.stops) {
      const status: Status =
        stop.end <= now
          ? "completed"
          : stop.start <= now
            ? "in_progress"
            : stop.start - stop.travel <= now
              ? "enroute"
              : "assigned";
      w.tickets[stop.jobId].status = status;
      w.tickets[stop.jobId].progress = status === "completed" ? 100 : 0;
    }
  }
  return recalculate(w);
}
