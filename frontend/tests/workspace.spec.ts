import { test, expect } from "@playwright/test";
import { createWorkspace, assignmentFor } from "../src/domain/workspace";
import { recalculate, solve } from "../src/domain/planner";
import { clock, distance, minutes } from "../src/api";
import type { Plan } from "../src/types";
import type { Workspace } from "../src/domain/workspace";
function valid(w: Workspace, p: Plan) {
  const seen: string[] = [];
  for (const r of p.routes) {
    const e = w.data.engineers.find((e) => e.id === r.engineerId)!;
    let end = minutes(e.shift[0]),
      origin = e.start,
      routers = 0,
      km = 0;
    for (const s of r.stops) {
      const j = w.data.jobs.find((j) => j.id === s.jobId)!;
      expect(e.skills).toContain(j.skill);
      if (j.transport) expect(e.transport).toBe(j.transport);
      expect(s.arrival).toBeGreaterThanOrEqual(end + s.travel);
      expect(s.start).toBeGreaterThanOrEqual(
        Math.max(
          s.arrival,
          minutes(j.window[0]),
          minutes(w.tickets[j.id].receivedAt),
        ),
      );
      expect(s.start).toBeLessThanOrEqual(minutes(j.window[1]));
      expect(s.end).toBe(s.start + j.duration);
      expect(s.end).toBeLessThanOrEqual(minutes(e.shift[1]));
      expect(s.km).toBeCloseTo(distance(origin, j.point), 8);
      routers += w.tickets[j.id].routers;
      km += s.km;
      origin = j.point;
      end = s.end;
      seen.push(j.id);
    }
    expect(routers).toBeLessThanOrEqual(w.stock[e.id]);
    expect(r.km).toBeCloseTo(km, 8);
  }
  const all = [...seen, ...p.unassigned.map((u) => u.jobId)];
  expect(new Set(all).size).toBe(all.length);
  expect(all.sort()).toEqual(
    w.data.jobs
      .filter((j) => w.tickets[j.id].status !== "cancelled")
      .map((j) => j.id)
      .sort(),
  );
  expect(p.metrics.assigned).toBe(seen.length);
}
test("planning respects resources, manual time and equipment; repairs unassigned work", () => {
  let w = recalculate(createWorkspace());
  valid(w, w.current!);
  valid(w, w.optimized!);
  expect(w.current!.unassigned.some((u) => u.jobId === "74202")).toBe(true);
  w.data.engineers.find((e) => e.id === "e4")!.skills.push("emergency");
  w.manual["74202"] = { engineerId: "e4", start: "11:00" };
  w = recalculate(w);
  valid(w, w.current!);
  expect(assignmentFor(w.current, "74202")?.stop.start).toBe(660);
  expect(assignmentFor(w.current, "74202")?.engineerId).toBe("e4");
  w.manual["74202"].start = "08:00";
  expect(() => recalculate(w)).toThrow("конфликтует");
  delete w.manual["74202"];
  w.stock = Object.fromEntries(w.data.engineers.map((e) => [e.id, 0]));
  const p = solve(w);
  expect(p.unassigned.some((u) => u.reason.includes("оборудования"))).toBe(
    true,
  );
  valid(w, p);
});
test("factual work stays fixed, closed work is not reassigned and cancellation is excluded", () => {
  let w = recalculate(createWorkspace());
  const r = w.current!.routes.find((r) => r.stops.length)!;
  const s = { ...r.stops[0] };
  w.tickets[s.jobId].status = "completed";
  w.tickets[s.jobId].progress = 100;
  w = recalculate(w);
  expect(assignmentFor(w.current, s.jobId)?.stop).toEqual(s);
  w.manual[s.jobId] = { engineerId: r.engineerId, start: clock(s.start + 30) };
  expect(() => recalculate(w)).toThrow("нельзя перемещать");
  delete w.manual[s.jobId];
  const id = w.data.jobs.find(
    (j) => j.id !== s.jobId && !assignmentFor(w.current, j.id),
  )!.id;
  w.tickets[id].status = "cancelled";
  w = recalculate(w);
  valid(w, w.current!);
  expect(w.current!.unassigned.some((u) => u.jobId === id)).toBe(false);
});
test("emergency wins contested capacity over connection; receipt time prevents early work", () => {
  const w = createWorkspace();
  w.data.engineers = [w.data.engineers[0]];
  const base = {
    ...w.data.jobs[0],
    point: w.data.engineers[0].start,
    window: ["09:00", "09:00"] as [string, string],
    duration: 70,
    transport: undefined,
  };
  w.data.jobs = [
    { ...base, id: "connection", skill: "connection" },
    { ...base, id: "emergency", skill: "emergency" },
  ];
  w.tickets = {
    connection: {
      ...Object.values(w.tickets)[0],
      workType: "connection",
      routers: 0,
    },
    emergency: {
      ...Object.values(w.tickets)[0],
      workType: "emergency",
      routers: 0,
    },
  };
  const p = solve(w);
  expect(p.routes[0].stops[0].jobId).toBe("emergency");
  expect(p.unassigned[0].jobId).toBe("connection");
  w.tickets.emergency.receivedAt = "10:00";
  const late = solve(w);
  expect(late.unassigned.some((u) => u.jobId === "emergency")).toBe(true);
});
test("support specialist unavailability is treated as a hard planning constraint", () => {
  const w = createWorkspace();
  for (const engineer of w.data.engineers) {
    w.engineerSettings[engineer.id].unavailable = [
      {
        id: `lunch-${engineer.id}`,
        date: w.data.date,
        from: "12:00",
        to: "13:00",
        note: "Недоступен",
      },
    ];
  }
  const plan = solve(w);
  valid(w, plan);
  for (const stop of plan.routes.flatMap((route) => route.stops)) {
    expect(stop.end <= 720 || stop.arrival >= 780).toBe(true);
  }
});
test("support intake, dispatcher planning, manual correction, progress and persistence", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Заявки", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Рабочее место" }).locator("option"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Моё расписание", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Моё расписание", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Моё расписание", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Анна Белова" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Мои заявки/ }).click();
  await expect(
    page.getByRole("button", { name: "Маршруты и расписание", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Создать заявку", exact: true })
    .click();
  await page.getByLabel("Название заявки").fill("Тестовое подключение");
  await page
    .getByLabel("Адрес", { exact: true })
    .fill("Москва, тестовый адрес");
  await page.getByLabel("Широта").fill("55.739");
  await page.getByLabel("Долгота").fill("37.684");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Создать заявку" })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Тестовое подключение" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Рабочее место" })
    .selectOption("dispatcher");
  await page
    .getByRole("button", { name: "Маршруты и расписание", exact: true })
    .click();
  await page.getByRole("button", { name: "Распределить все заявки" }).click();
  await expect(page.getByText("План готов.", { exact: false })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("schedule-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Карта", exact: true }).click();
  await expect(page.getByLabel("Карта заявок и маршрутов")).toBeVisible();
  await page.getByRole("button", { name: "Расписание", exact: true }).click();
  await page.getByRole("button", { name: "№ 74202", exact: true }).click();
  await page.getByRole("button", { name: "Исправить условия заявки" }).click();
  await page.getByLabel("Требование к транспорту").selectOption("car");
  await page
    .getByRole("button", { name: "Сохранить изменения", exact: true })
    .click();
  await page.getByLabel("Исполнитель", { exact: true }).selectOption("e1");
  await page.getByLabel("Начало работы", { exact: true }).fill("11:00");
  await page.getByRole("button", { name: "Назначить и пересчитать" }).click();
  await expect(
    page.getByText("Назначение сохранено.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: /^Заявки \d/ }).click();
  await page
    .getByRole("textbox", { name: "Поиск заявок" })
    .fill("Тестовое подключение");
  await page.getByRole("button", { name: /Открыть заявку REQ-/ }).click();
  await page.getByLabel("Исполнитель", { exact: true }).selectOption("e4");
  await page.getByLabel("Начало работы", { exact: true }).fill("14:00");
  await page.getByRole("button", { name: "Назначить и пересчитать" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .getByRole("button", { name: "Эффективность", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Отклонение от оптимизированного плана",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("efficiency-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Рабочее место" })
    .selectOption("support");
  await page
    .getByRole("textbox", { name: "Поиск заявок" })
    .fill("Тестовое подключение");
  await page.getByRole("button", { name: /Открыть заявку REQ-/ }).click();
  await page
    .getByRole("combobox", { name: "Статус заявки", exact: true })
    .selectOption("in_progress");
  await page.getByRole("button", { name: "Сохранить статус" }).click();
  await expect(
    page.getByRole("dialog").getByText("В работе", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Статус заявки", exact: true })
    .selectOption("review");
  await page.getByRole("button", { name: "Сохранить статус" }).click();
  await expect(
    page.getByText("Готовность передана диспетчеру", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.reload();
  await page
    .getByRole("textbox", { name: "Поиск заявок" })
    .fill("Тестовое подключение");
  await expect(
    page.getByText("Ожидает закрытия", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Рабочее место" })
    .selectOption("dispatcher");
  await page
    .getByRole("textbox", { name: "Поиск заявок" })
    .fill("Тестовое подключение");
  await page.getByRole("button", { name: /Открыть заявку REQ-/ }).click();
  await page
    .getByRole("combobox", { name: "Статус заявки", exact: true })
    .selectOption("completed");
  await page.getByRole("button", { name: "Сохранить статус" }).click();
  await expect(
    page.getByRole("dialog").getByText("Завершена", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт плана" }).click();
  expect((await dl).suggestedFilename()).toBe("dispatch-plan.json");
  expect(errors).toEqual([]);
});
test("Polaris desktop and mobile requests, filters, empty state and keyboard modal", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Владелец заявок").selectOption("created");
  await page.screenshot({
    path: testInfo.outputPath("requests-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Фильтры", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Тип работ", exact: true })
    .selectOption("emergency");
  await expect(page.locator(".kanban-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Сбросить", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("requests-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("textbox", { name: "Поиск заявок" })
    .fill("несуществующий адрес");
  await expect(
    page.getByRole("heading", { name: "Заявки не найдены" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Создать заявку", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("support ownership, rejected manual edits and import confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Владелец заявок" })
    .selectOption("all");
  await page.getByRole("button", { name: "Открыть заявку 74198" }).click();
  await expect(
    page.getByRole("button", { name: "Редактировать заявку" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Сохранить статус" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Рабочее место" })
    .selectOption("dispatcher");
  await page
    .getByRole("button", { name: "Маршруты и расписание", exact: true })
    .click();
  await page.getByRole("button", { name: "Распределить все заявки" }).click();
  await page.getByRole("button", { name: "№ 74202", exact: true }).click();
  await page.getByRole("button", { name: "Назначить и пересчитать" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "транспорта",
  );
  await expect(
    page.getByRole("dialog").getByText("Ручное назначение", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByLabel("Загрузить JSON").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось прочитать JSON",
  );
  const data = createWorkspace().data;
  data.name = "Импортированный участок";
  await page.getByLabel("Загрузить JSON").setInputFiles({
    name: "new.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByRole("dialog")).toContainText("Заменить данные");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page.getByText("Импортированный участок")).toHaveCount(0);
});
