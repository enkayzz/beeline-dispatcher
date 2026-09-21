import { test, expect } from "@playwright/test";
import {
  createWorkspace,
  personalJobs,
  personalStops,
  switchDay,
  importDay,
  STORAGE_KEY,
} from "../src/domain/workspace";
import { recalculate } from "../src/domain/planner";

test("personal scope follows assignments, including completed and cancelled history", () => {
  let w = recalculate(createWorkspace());
  const own = personalStops(w);
  expect(own.length).toBeGreaterThan(0);
  expect(
    personalJobs(w)
      .map((j) => j.id)
      .sort(),
  ).toEqual(own.map((s) => s.jobId).sort());
  const stop = own[0];
  // Originator does not determine the assigned employee.
  w.tickets[stop.jobId].owner = "support-2";
  w.tickets[stop.jobId].status = "completed";
  w = recalculate(w);
  expect(personalJobs(w).some((j) => j.id === stop.jobId)).toBe(true);
  w.tickets[stop.jobId].status = "cancelled";
  w.tickets[stop.jobId].lastAssignment = { engineerId: "e4", stop };
  w = recalculate(w);
  expect(personalStops(w).some((s) => s.jobId === stop.jobId)).toBe(true);
  expect(
    w
      .current!.routes.flatMap((r) => r.stops)
      .some((s) => s.jobId === stop.jobId),
  ).toBe(false);
});

test("date switching and imports preserve separate plans and states for repeated ticket IDs", () => {
  let w = recalculate(createWorkspace());
  const date = w.data.date;
  const stop = personalStops(w)[0];
  w.tickets[stop.jobId].status = "completed";
  w.tickets[stop.jobId].progress = 100;
  const original = structuredClone(w.current);
  w = switchDay(w, "2026-08-24");
  expect(w.data.jobs).toEqual([]);
  expect(personalJobs(w)).toEqual([]);
  const dataset = createWorkspace().data;
  dataset.date = "2026-08-24";
  w = recalculate(importDay(w, createWorkspace(dataset)));
  expect(w.tickets[stop.jobId].status).toBe("new");
  w = switchDay(w, date);
  expect(w.current).toEqual(original);
  expect(w.tickets[stop.jobId].status).toBe("completed");
  expect(w.days!["2026-08-24"].tickets[stop.jobId].status).toBe("new");
  expect(() => switchDay(w, "2026-02-30")).toThrow();
});

test("menu, board and calendar agree across weeks, completion, empty dates and reload", async ({
  page,
}) => {
  let w = recalculate(createWorkspace());
  const originalDate = w.data.date;
  const own = personalStops(w);
  const completedId = own[0].jobId;
  w.tickets[completedId].status = "completed";
  w.tickets[completedId].progress = 100;
  w = switchDay(w, "2026-08-24");
  const dataset = createWorkspace().data;
  dataset.date = "2026-08-24";
  w = recalculate(importDay(w, createWorkspace(dataset)));
  w = switchDay(w, originalDate);
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: JSON.stringify(w) },
  );
  await page.goto("/");
  await expect(page.getByTestId("request-nav-count")).toHaveText(
    String(own.length),
  );
  await expect(page.locator(".kanban-card")).toHaveCount(own.length);
  await expect(page.locator(".stage-closed .kanban-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Моё расписание", exact: true })
    .click();
  await expect(page.getByTestId("schedule-count")).toHaveText(
    String(own.length),
  );
  await expect(page.locator(".agenda-completed")).toHaveCount(1);
  await page.getByLabel("Следующая неделя").click();
  await expect(page.getByLabel("Рабочая дата", { exact: true })).toHaveValue(
    "2026-08-24",
  );
  await expect(page.locator(".agenda-completed")).toHaveCount(0);
  await page.getByLabel("Следующая неделя").click();
  await expect(page.getByTestId("schedule-count")).toHaveText("0");
  await expect(page.getByTestId("request-nav-count")).toHaveText("0");
  await page.reload();
  await expect(page.getByLabel("Рабочая дата", { exact: true })).toHaveValue(
    "2026-08-31",
  );
  await page.getByLabel("Сохранённые дни").selectOption(originalDate);
  await expect(page.locator(".kanban-card")).toHaveCount(own.length);
  await expect(page.locator(".stage-closed .kanban-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Моё расписание", exact: true })
    .click();
  await page.getByLabel("Предыдущая неделя").click();
  await expect(page.getByLabel("Рабочая дата", { exact: true })).toHaveValue(
    "2026-08-10",
  );
  await expect(page.getByTestId("schedule-count")).toHaveText("0");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("schedule edits recalculate saved future dates and revoked permission survives date switching", async ({
  page,
}) => {
  let w = recalculate(createWorkspace());
  const dataset = createWorkspace().data;
  dataset.date = "2026-08-24";
  w = recalculate(importDay(w, createWorkspace(dataset)));
  w = switchDay(w, "2026-08-17");
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: STORAGE_KEY, value: JSON.stringify(w) },
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Моё расписание", exact: true })
    .click();
  await page.getByRole("button", { name: "Мои настройки" }).click();
  await page.getByLabel("Оборудование специалиста поддержки").fill("6");
  await page.getByLabel("Пн начало", { exact: true }).fill("10:00");
  await page.getByRole("button", { name: "Сохранить и пересчитать" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Следующая неделя").click();
  await expect(page.getByText("6 роутеров", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Рабочий день 10:00–18:00", { exact: true }),
  ).toBeVisible();
  const state = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
  const futureStops = state.current.routes.find(
    (r: { engineerId: string }) => r.engineerId === "e4",
  ).stops;
  expect(futureStops.every((s: { start: number }) => s.start >= 600)).toBe(
    true,
  );
  await page.getByLabel("Рабочее место").selectOption("dispatcher");
  await page
    .getByRole("button", { name: "График поддержки", exact: true })
    .click();
  await page
    .locator(".matrix-row")
    .filter({ hasText: "Анна Белова" })
    .getByRole("button", { name: "Настроить" })
    .click();
  await page.getByRole("checkbox", { name: /Разрешить поддержке/ }).uncheck();
  await page.getByRole("button", { name: "Сохранить и пересчитать" }).click();
  await page.getByLabel("Сохранённые дни").selectOption("2026-08-17");
  await page.getByLabel("Рабочее место").selectOption("support");
  await page
    .getByRole("button", { name: "Моё расписание", exact: true })
    .click();
  await page.getByRole("button", { name: "Мои настройки" }).click();
  await expect(
    page.getByLabel("Оборудование специалиста поддержки"),
  ).toBeDisabled();
});
