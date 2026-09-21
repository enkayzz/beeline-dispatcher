import { useState } from "react";
import { CalendarDays, Settings2, ShieldCheck, ShieldX } from "lucide-react";
import { transportNames } from "../types";
import {
  dayKeys,
  dayNames,
  engineerSettingsFor,
  shiftDate,
  dayKey,
  dayAt,
  type Workspace,
} from "../domain/workspace";
import EngineerEditor, {
  type EngineerUpdate,
} from "../components/EngineerEditor";

export default function Engineers({
  w,
  onSave,
}: {
  w: Workspace;
  onSave: (engineerId: string, update: EngineerUpdate) => void;
}) {
  const [selected, setSelected] = useState<string>();
  const monday = shiftDate(w.data.date, -dayKeys.indexOf(dayKey(w.data.date)));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">Команда и доступность</div>
          <h1>График поддержки</h1>
          <p>
            Постоянные часы, исключения, транспорт, оборудование и права на
            самостоятельное редактирование.
          </p>
        </div>
        <span className="badge neutral">
          <CalendarDays size={14} /> {w.data.engineers.length} сотрудников
        </span>
      </div>

      <section className="card engineer-summary-strip">
        <div>
          <ShieldCheck size={18} />
          <span>
            <b>
              {
                w.data.engineers.filter(
                  (engineer) => engineerSettingsFor(w, engineer.id).canSelfEdit,
                ).length
              }
            </b>
            могут менять свои данные
          </span>
        </div>
        <p>
          Самостоятельные изменения пересчитывают только будущие работы. Начатые
          задачи и ручные фиксации защищены.
        </p>
      </section>

      <section className="card schedule-matrix-card">
        <div className="section-title padded">
          <div>
            <h2>
              График недели {monday} — {shiftDate(monday, 6)}
            </h2>
            <p className="muted">
              Нажмите «Настроить», чтобы изменить часы или добавить
              недоступность.
            </p>
          </div>
          <div className="schedule-legend">
            <span>
              <i className="working" /> Работает
            </span>
            <span>
              <i /> Выходной
            </span>
          </div>
        </div>
        <div className="schedule-matrix-scroll">
          <div className="schedule-matrix">
            <div className="matrix-corner">Сотрудник</div>
            {dayKeys.map((day, index) => (
              <div className="matrix-day" key={day}>
                {dayNames[day]} · {shiftDate(monday, index).slice(5)}
              </div>
            ))}
            {w.data.engineers.map((engineer) => {
              const settings = engineerSettingsFor(w, engineer.id);
              return (
                <div className="matrix-row" key={engineer.id}>
                  <div className="matrix-engineer">
                    <span
                      className="avatar"
                      style={{ background: engineer.color }}
                    >
                      {engineer.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </span>
                    <div>
                      <b>{engineer.name}</b>
                      <small>
                        {transportNames[engineer.transport]} ·{" "}
                        {w.stock[engineer.id]} роут.
                      </small>
                      <span
                        className={`self-edit ${settings.canSelfEdit ? "allowed" : "blocked"}`}
                      >
                        {settings.canSelfEdit ? (
                          <ShieldCheck size={12} />
                        ) : (
                          <ShieldX size={12} />
                        )}
                        {settings.canSelfEdit
                          ? "Саморедактирование"
                          : "Только диспетчер"}
                      </span>
                      <button onClick={() => setSelected(engineer.id)}>
                        <Settings2 size={14} /> Настроить
                      </button>
                    </div>
                  </div>
                  {dayKeys.map((day, index) => {
                    const date = shiftDate(monday, index);
                    const stored = dayAt(w, date);
                    const daySettings = engineerSettingsFor(
                      stored,
                      engineer.id,
                    );
                    const value = daySettings.weekly[day];
                    return (
                      <div
                        className={`matrix-cell ${value.enabled ? "working" : "off"}`}
                        key={day}
                      >
                        {value.enabled ? (
                          <>
                            <b>
                              {value.start}–{value.end}
                            </b>
                            <small>
                              {daySettings.unavailable.filter(
                                (period) => period.date === date,
                              ).length
                                ? "Есть исключения"
                                : "Доступен"}
                            </small>
                          </>
                        ) : (
                          <span>Выходной</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {selected && (
        <EngineerEditor
          key={`${selected}-${w.history.length}`}
          w={w}
          engineerId={selected}
          mode="dispatcher"
          onClose={() => setSelected(undefined)}
          onSave={(update) => {
            onSave(selected, update);
            setSelected(undefined);
          }}
        />
      )}
    </>
  );
}
