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

test("published import example is available after production build", async ({
  request,
}) => {
  const response = await request.get("/demo-dataset.json");
  expect(response.ok()).toBeTruthy();
  expect(parseDataset(await response.text()).jobs.length).toBeGreaterThan(0);
});
