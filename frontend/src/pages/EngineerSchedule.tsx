import { useMemo, useState } from "react";
import {
  CalendarClock,
  Clock3,
  MapPin,
  Package,
  Settings2,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { clock, minutes } from "../api";
import { transportNames } from "../types";
import {
  dayKey,
  dayNames,
  engineerSettingsFor,
  personalStops,
  shiftDate,
  ticketStatus,
  statusNames,
  dayAt,
  type Workspace,
} from "../domain/workspace";
import EngineerEditor, {
  type EngineerUpdate,
} from "../components/EngineerEditor";
import { Empty, Badge } from "../components/ui";

function weekOf(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(date, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

export default function EngineerSchedule({
  w,
  engineerId,
  onSelect,
  onSave,
  onDateChange,
}: {
  w: Workspace;
  engineerId: string;
  onSelect: (jobId: string) => void;
  onSave: (update: EngineerUpdate) => void;
  onDateChange: (date: string) => void;
}) {
  const engineer = w.data.engineers.find((item) => item.id === engineerId)!;
  const settings = engineerSettingsFor(w, engineerId);
  const dates = useMemo(() => weekOf(w.data.date), [w.data.date]);
  const selectedDate = w.data.date;
  const [editing, setEditing] = useState(false);
  const selectedDay = settings.weekly[dayKey(selectedDate)];
  const stops = personalStops(w);
  const unavailable = settings.unavailable.filter(
    (period) => period.date === selectedDate,
  );
  const startMinute =
    Math.floor(
      Math.min(
        selectedDay.enabled ? minutes(selectedDay.start) : 480,
        ...stops.map((s) => s.start),
        ...unavailable.map((p) => minutes(p.from)),
      ) / 60,
    ) * 60;
  const endMinute =
    Math.ceil(
      Math.max(
        selectedDay.enabled ? minutes(selectedDay.end) : 1080,
        ...stops.map((s) => s.end),
        ...unavailable.map((p) => minutes(p.to)),
      ) / 60,
    ) * 60;
  const hours = Array.from(
    { length: Math.max(1, (endMinute - startMinute) / 60 + 1) },
    (_, index) => startMinute + index * 60,
  );
  const top = (value: number) => ((value - startMinute) / 60) * 68;

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Рабочее место поддержки</div>
          <h1>Моё расписание</h1>
          <p>Маршрут, рабочие часы и личная доступность в одном месте.</p>
        </div>
        <button onClick={() => setEditing(true)}>
          <Settings2 size={16} /> Мои настройки
        </button>
      </div>

      {!settings.canSelfEdit && (
        <div className="banner neutral">
          <ShieldCheck size={17} />
          <span>
            График доступен для просмотра. Изменения подтверждает диспетчер.
          </span>
        </div>
      )}

      <section className="card engineer-profile-strip">
        <span className="avatar large" style={{ background: engineer.color }}>
          {engineer.name
            .split(" ")
            .map((part) => part[0])
            .join("")}
        </span>
        <div>
          <h2>{engineer.name}</h2>
          <p>Специалист выездной поддержки</p>
        </div>
        <div className="profile-fact">
          <span>Транспорт</span>
          <b>{transportNames[engineer.transport]}</b>
        </div>
        <div className="profile-fact">
          <span>Оборудование</span>
          <b>{w.stock[engineerId]} роутеров</b>
        </div>
        <div className="profile-fact">
          <span>Заявок за выбранный день</span>
          <b data-testid="schedule-count">{stops.length}</b>
        </div>
      </section>

      <section className="card engineer-calendar">
        <div className="calendar-title">
          <div>
            <CalendarClock size={19} />
            <span>
              <b>
                {dates[0]} — {dates[6]}
              </b>
              <small>Выберите день, чтобы посмотреть часы и задания</small>
            </span>
          </div>
          <div className="actions week-navigation">
            <button
              aria-label="Предыдущая неделя"
              onClick={() => onDateChange(shiftDate(selectedDate, -7))}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() =>
                onDateChange(
                  new Date().toLocaleDateString("sv-SE", {
                    timeZone: "Europe/Moscow",
                  }),
                )
              }
            >
              Сегодня
            </button>
            <button
              aria-label="Следующая неделя"
              onClick={() => onDateChange(shiftDate(selectedDate, 7))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="week-strip">
          {dates.map((date) => {
            const key = dayKey(date);
            const stored = dayAt(w, date);
            const daySettings = engineerSettingsFor(stored, engineerId);
            const workday = daySettings.weekly[key];
            const dayCount = personalStops(stored).length;
            const hasException = daySettings.unavailable.some(
              (period) => period.date === date,
            );
            return (
              <button
                className={`${selectedDate === date ? "selected" : ""} ${workday.enabled ? "workday" : "day-off"}`}
                key={date}
                onClick={() => onDateChange(date)}
              >
                <span>{dayNames[key]}</span>
                <b>{new Date(`${date}T12:00`).getDate()}</b>
                <small>
                  {workday.enabled
                    ? `${workday.start}–${workday.end}`
                    : "Выходной"}
                </small>
                <small>{dayCount ? `Заявок: ${dayCount}` : "Нет заявок"}</small>
                {hasException && <i title="Есть недоступное время" />}
              </button>
            );
          })}
        </div>
      </section>

      <div className="engineer-day-layout">
        <section className="card day-agenda">
          <div className="section-title padded">
            <div>
              <h2>
                {new Date(`${selectedDate}T12:00`).toLocaleDateString("ru-RU", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </h2>
              <p className="muted">
                {selectedDay.enabled
                  ? `Рабочий день ${selectedDay.start}–${selectedDay.end}`
                  : "Постоянный выходной"}
              </p>
            </div>
            {unavailable.length > 0 && (
              <span className="badge status-review">
                {unavailable.length} огранич.
              </span>
            )}
          </div>
          {!selectedDay.enabled && !stops.length && !unavailable.length ? (
            <Empty title="Выходной день">
              Чтобы сделать день рабочим, измените постоянный график.
            </Empty>
          ) : (
            <div
              className="time-canvas"
              style={{ height: Math.max(480, (hours.length - 1) * 68 + 24) }}
            >
              {hours.map((hour) => (
                <div className="hour-row" key={hour} style={{ top: top(hour) }}>
                  <time>{clock(hour)}</time>
                  <span />
                </div>
              ))}
              {unavailable.map((period) => (
                <div
                  className="agenda-block unavailable"
                  key={period.id}
                  style={{
                    top: top(minutes(period.from)),
                    height: Math.max(
                      38,
                      top(minutes(period.to)) - top(minutes(period.from)),
                    ),
                  }}
                >
                  <Clock3 size={14} />
                  <span>
                    <b>Недоступен · {period.note}</b>
                    <small>
                      {period.from}–{period.to}
                    </small>
                  </span>
                </div>
              ))}
              {stops.map((stop, index) => {
                const job = w.data.jobs.find((item) => item.id === stop.jobId)!;
                return (
                  <button
                    className={`agenda-block job agenda-${ticketStatus(w, job)}`}
                    key={stop.jobId}
                    style={{
                      top: top(stop.start),
                      height: Math.max(46, top(stop.end) - top(stop.start)),
                      borderLeftColor: engineer.color,
                    }}
                    onClick={() => onSelect(stop.jobId)}
                  >
                    <span className="agenda-order">{index + 1}</span>
                    <span>
                      <b>{job.title}</b>
                      <small>
                        {clock(stop.start)}–{clock(stop.end)} · {job.address}
                      </small>
                      <small>{statusNames[ticketStatus(w, job)]}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="card day-route-summary">
          <div className="section-title padded">
            <h2>Задания дня</h2>
            <span className="badge neutral">{stops.length}</span>
          </div>
          {stops.length ? (
            <ol>
              {stops.map((stop) => {
                const job = w.data.jobs.find((item) => item.id === stop.jobId)!;
                return (
                  <li key={stop.jobId}>
                    <button onClick={() => onSelect(stop.jobId)}>
                      <time>{clock(stop.start)}</time>
                      <span>
                        <b>{job.title}</b>
                        <Badge status={ticketStatus(w, job)} />
                        <small>
                          <MapPin size={12} /> {job.address}
                        </small>
                        <small>
                          <Package size={12} /> {w.tickets[job.id].routers}{" "}
                          роут. · {stop.travel} мин в пути
                        </small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="muted padded">
              На {selectedDate} назначенных вам работ нет. Здесь появятся
              заявки, созданные или загруженные на эту дату и назначенные
              диспетчером. Прошедшие дни сохраняются вместе со статусами работ.
            </p>
          )}
        </aside>
      </div>

      {editing && (
        <EngineerEditor
          w={w}
          engineerId={engineerId}
          mode="self"
          onClose={() => setEditing(false)}
          onSave={(update) => {
            onSave(update);
            setEditing(false);
          }}
        />
      )}
    </>
  );
}
