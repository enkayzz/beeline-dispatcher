import { test, expect } from "@playwright/test";
import { demo, urgentJob } from "../src/demo";
import { api, buildPlans, minutes, distance } from "../src/api";
import { parseDataset } from "../src/validation";
import type { Dataset, Plan } from "../src/types";

function checkConstraints(data: Dataset, plan: Plan) {
  const assigned: string[] = [];
  let total = 0;
  for (const route of plan.routes) {
    const e = data.engineers.find((e) => e.id === route.engineerId)!;
    let end = minutes(e.shift[0]),
      point = e.start;
    for (const stop of route.stops) {
      const j = data.jobs.find((j) => j.id === stop.jobId)!;
      expect(assigned).not.toContain(j.id);
      assigned.push(j.id);
      expect(e.skills).toContain(j.skill);
      if (j.transport) expect(e.transport).toBe(j.transport);
      expect(stop.arrival).toBeGreaterThanOrEqual(end + stop.travel);
      expect(stop.start).toBeGreaterThanOrEqual(
        Math.max(stop.arrival, minutes(j.window[0])),
      );
      expect(stop.start).toBeLessThanOrEqual(minutes(j.window[1]));
      expect(stop.end).toBe(stop.start + j.duration);
      expect(stop.end).toBeLessThanOrEqual(minutes(e.shift[1]));
      expect(stop.km).toBeCloseTo(distance(point, j.point), 8);
      end = stop.end;
      point = j.point;
      total += stop.km;
    }
    expect(route.km).toBeCloseTo(
      route.stops.reduce((n, s) => n + s.km, 0),
      8,
    );
  }
  const unassigned = plan.unassigned.map((u) => u.jobId);
  expect(new Set([...assigned, ...unassigned]).size).toBe(data.jobs.length);
  expect(assigned.length + unassigned.length).toBe(data.jobs.length);
  expect(plan.metrics.km).toBeCloseTo(total, 8);
  expect(plan.metrics.assigned).toBe(assigned.length);
  expect(plan.metrics.engineers).toBe(
    plan.routes.filter((r) => r.stops.length).length,
  );
}

test("plans satisfy skills, time, transport and metrics; replan freezes begun work", async () => {
  const pair = buildPlans(demo);
  checkConstraints(demo, pair.baseline);
  checkConstraints(demo, pair.optimized);
  expect(pair.optimized.metrics.assigned).toBe(11);
  expect(
    pair.optimized.unassigned.find((u) => u.jobId === "74202")?.reason,
  ).toContain("транспорта");
  const result = await api.replan(demo, pair.optimized, {
    type: "urgent",
    at: "11:00",
    job: urgentJob,
  });
  checkConstraints(result.dataset, result.plans.optimized);
  checkConstraints(result.dataset, result.plans.baseline);
  expect(
    result.plans.optimized.routes.flatMap((r) => r.stops.map((s) => s.jobId)),
  ).toContain(urgentJob.id);
  for (const r of pair.optimized.routes) {
    const frozen = r.stops.filter((s) => s.start < 660);
    expect(
      result.plans.optimized.routes
        .find((n) => n.engineerId === r.engineerId)
        ?.stops.slice(0, frozen.length),
    ).toEqual(frozen);
  }
});

test("import rejects malformed data and duplicate IDs", () => {
  expect(parseDataset(JSON.stringify(demo)).jobs).toHaveLength(12);
  const changed = structuredClone(demo);
  changed.jobs[1].id = changed.jobs[0].id;
  expect(() => parseDataset(JSON.stringify(changed))).toThrow("Повторяющиеся");
  const bad = structuredClone(demo);
  bad.jobs[0].window = ["23:99", "24:00"];
  expect(() => parseDataset(JSON.stringify(bad))).toThrow("Заявка 1");
});

test("published import example is available after production build", async ({ request }) => {
  const response = await request.get("/demo-dataset.json");
  expect(response.ok()).toBeTruthy();
  expect(parseDataset(await response.text()).jobs.length).toBeGreaterThan(0);
});

test("dispatcher journey: plan, reason, timeline, urgent event, compare, export, import", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Всё по маршруту." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Построить план", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Событие дня", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("План готов.", { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preview-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: /№ 74202.*Диагностика/ }).click();
  await expect(
    page.getByRole("heading", { name: "Почему не назначена?" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Расписание", exact: true }).click();
  await page.getByRole("button", { name: /Заявка 74198, начало/ }).click();
  await expect(
    page.getByRole("heading", { name: "Почему этот инженер?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть заявку" }).click();
  await page.getByRole("button", { name: "Карта", exact: true }).click();
  await page.getByRole("button", { name: "Событие дня", exact: true }).click();
  await page
    .getByRole("button", { name: "Добавить и перестроить план" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Восстановить связь в офисе",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Почему этот инженер?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Закрыть заявку" }).click();
  await page
    .getByRole("button", { name: "Эффективность", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Изменения после срочной заявки" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "№ SOS-01", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("preview-comparison.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Рабочий день", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать план JSON" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "dispatch-plan.json",
  );
  await page
    .getByRole("button", { name: "Загрузить данные", exact: true })
    .click();
  await page
    .getByLabel("Загрузить JSON")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{"),
    });
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось прочитать JSON",
  );
  await page
    .getByLabel("Загрузить JSON")
    .setInputFiles({
      name: "demo.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(demo)),
    });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Построить план", exact: true }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile navigation and search empty state", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Построить план", exact: true })
    .first()
    .click();
  await expect(page.getByText("План готов.", { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preview-mobile.png"), fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page
    .getByRole("button", { name: /Заявки/ })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Поиск заявок" })
    .fill("несуществующий адрес");
  await expect(
    page.getByRole("heading", { name: "Заявки не найдены" }),
  ).toBeVisible();
});
