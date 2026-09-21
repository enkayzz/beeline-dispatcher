import type { Dataset } from "./types";
export function parseDataset(text: string): Dataset {
  const data = JSON.parse(text);
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const skills = ["local", "connection", "emergency"];
  const transports = ["car", "walk", "bike", "transit"];
  const obj = (v: unknown): v is Record<string, any> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const str = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const point = (v: unknown) =>
    Array.isArray(v) &&
    v.length === 2 &&
    v.every(Number.isFinite) &&
    Math.abs(v[0]) <= 90 &&
    Math.abs(v[1]) <= 180;
  const time = (v: unknown) =>
    Array.isArray(v) &&
    v.length === 2 &&
    v.every(
      (t) => typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t),
    ) &&
    v[0] <= v[1];
  if (
    !obj(data) ||
    !str(data.name) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
    Number.isNaN(Date.parse(data.date)) ||
    new Date(data.date).toISOString().slice(0, 10) !== data.date
  )
    fail("Укажите name и действительную date в формате YYYY-MM-DD.");
  if (!Array.isArray(data.jobs) || data.jobs.length > 100)
    fail("Нужен массив jobs: до 100 заявок, пустой день допустим.");
  if (
    !Array.isArray(data.engineers) ||
    !data.engineers.length ||
    data.engineers.length > 30
  )
    fail("Нужен массив engineers: от 1 до 30 специалистов поддержки.");
  for (const [i, j] of data.jobs.entries()) {
    if (
      !obj(j) ||
      !str(j.id) ||
      !str(j.title) ||
      !str(j.address) ||
      !point(j.point) ||
      !time(j.window) ||
      !Number.isInteger(j.duration) ||
      j.duration <= 0 ||
      j.duration > 540 ||
      !skills.includes(j.skill) ||
      !["normal", "urgent"].includes(j.priority) ||
      (j.transport !== undefined && !transports.includes(j.transport))
    )
      fail(
        `Заявка ${i + 1}: проверьте ID, название, адрес, координаты, окно, длительность, навык, приоритет и транспорт. Формат есть в примере JSON.`,
      );
  }
  for (const [i, e] of data.engineers.entries()) {
    if (
      !obj(e) ||
      !str(e.id) ||
      !str(e.name) ||
      !point(e.start) ||
      !time(e.shift) ||
      !Array.isArray(e.skills) ||
      !e.skills.length ||
      e.skills.length > 3 ||
      e.skills.some((s: unknown) => !skills.includes(s as string)) ||
      !transports.includes(e.transport)
    )
      fail(
        `Специалист поддержки ${i + 1}: проверьте ID, имя, стартовую точку, смену, навыки и транспорт.`,
      );
    e.role = typeof e.role === "string" ? e.role : "Специалист выездной поддержки";
    e.color =
      typeof e.color === "string" && /^#[0-9a-f]{6}$/i.test(e.color)
        ? e.color
        : ["#6665df", "#109786", "#e58b43", "#478fca", "#b366b6"][i % 5];
  }
  for (const key of ["jobs", "engineers"])
    if (
      new Set(data[key].map((v: { id: string }) => v.id)).size !==
      data[key].length
    )
      fail(`Повторяющиеся ID в ${key}.`);
  return data as Dataset;
}
