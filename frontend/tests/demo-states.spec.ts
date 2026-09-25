import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../src/domain/demoStates";
import { STORAGE_KEY } from "../src/domain/workspace";
test("demo snapshots show intake, active work and closed evening", () => {
  const morning = demoSnapshot("morning"),
    day = demoSnapshot("day"),
    evening = demoSnapshot("evening");
  expect(morning.current).toBeUndefined();
  expect(
    Object.values(day.tickets).some((t) => t.status === "completed"),
  ).toBeTruthy();
  expect(
    Object.values(day.tickets).some((t) => t.status === "in_progress"),
  ).toBeTruthy();
  expect(evening.current!.unassigned.length).toBeGreaterThan(0);
  for (const route of evening.current!.routes)
    for (const stop of route.stops)
      expect(evening.tickets[stop.jobId].status).toBe("completed");
});
test("demo preserves live data, distribution and compact visual schedule", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Рабочее место" })
    .selectOption("dispatcher");
  const live = await page.evaluate(
    (key) => localStorage.getItem(key),
    STORAGE_KEY,
  );
  await expect(page.locator('input[type="date"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Утро", exact: true }).click();
  await page
    .getByRole("button", { name: "Распределить все заявки", exact: true })
    .click();
  await expect(
    page.locator(".stage-waiting .kanban-card").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "День", exact: true }).click();
  await expect(
    page.locator(".stage-closed .kanban-card").first(),
  ).toBeVisible();
  await expect(page.locator(".emergency-card").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("board.png"), fullPage: true });
  await page.getByRole("button", { name: /Маршруты и расписание/ }).click();
  await expect(page.locator(".timeline-axis time")).toHaveCount(10);
  await page.screenshot({
    path: info.outputPath("timeline.png"),
    fullPage: true,
  });
  await page.locator(".timeline-job").first().click();
  await expect(page.getByLabel("Сводка назначения")).toBeVisible();
  await expect(
    page.getByLabel("Выполнение заявки", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Карта", exact: true }).click();
  await expect(page.locator(".emergency-pin").first()).toBeVisible();
  await page.getByRole("button", { name: "Вечер", exact: true }).click();
  await expect(page.locator(".demo-caption")).toContainText("18:00");
  await page.getByRole("button", { name: "Выйти из демо" }).click();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
  ).toBe(live);
});
