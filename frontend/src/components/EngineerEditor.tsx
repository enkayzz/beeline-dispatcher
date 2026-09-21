import { useState, type FormEvent } from "react";
import { CalendarOff, Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { Skill, Transport } from "../types";
import { skillNames, transportNames } from "../types";
import {
  dayKeys,
  dayNames,
  engineerSettingsFor,
  type EngineerSettings,
  type Workspace,
} from "../domain/workspace";
import { Modal } from "./ui";

export interface EngineerUpdate {
  transport: Transport;
  stock: number;
  skills: Skill[];
  settings: EngineerSettings;
}

export default function EngineerEditor({
  w,
  engineerId,
  mode,
  onSave,
  onClose,
}: {
  w: Workspace;
  engineerId: string;
  mode: "dispatcher" | "self";
  onSave: (update: EngineerUpdate) => void;
  onClose: () => void;
}) {
  const engineer = w.data.engineers.find((item) => item.id === engineerId)!;
  const initial = engineerSettingsFor(w, engineerId);
  const [transport, setTransport] = useState<Transport>(engineer.transport);
  const [stock, setStock] = useState(w.stock[engineerId] ?? 0);
  const [skills, setSkills] = useState<Skill[]>(engineer.skills);
  const [settings, setSettings] = useState<EngineerSettings>(
    structuredClone(initial),
  );
  const [date, setDate] = useState(w.data.date);
  const [from, setFrom] = useState("12:00");
  const [to, setTo] = useState("13:00");
  const [note, setNote] = useState("Личное время");
  const [error, setError] = useState("");
  const disabled = mode === "self" && !initial.canSelfEdit;

  function addUnavailable() {
    setError("");
    if (!date || from >= to) {
      setError("Укажите корректный интервал недоступности.");
      return;
    }
    setSettings((current) => ({
      ...current,
      unavailable: [
        ...current.unavailable,
        {
          id: `off-${Date.now().toString(36)}`,
          date,
          from,
          to,
          note: note.trim() || "Недоступен",
        },
      ].sort((a, b) =>
        `${a.date}${a.from}`.localeCompare(`${b.date}${b.from}`),
      ),
    }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!skills.length) {
      setError(
        "У специалиста поддержки должен остаться хотя бы один допуск к работам.",
      );
      return;
    }
    for (const day of dayKeys) {
      const value = settings.weekly[day];
      if (value.enabled && value.start >= value.end) {
        setError(`Проверьте часы работы за ${dayNames[day]}.`);
        return;
      }
    }
    try {
      onSave({ transport, stock, skills, settings });
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  return (
    <Modal
      title={
        mode === "dispatcher"
          ? `Настройки поддержки · ${engineer.name}`
          : "Мои рабочие настройки"
      }
      wide
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {disabled && (
          <div className="banner warning">
            <ShieldCheck size={18} />
            <div>
              <strong>Редактирование ограничено диспетчером</strong>
              <p>Посмотрите график и обратитесь к диспетчеру для изменения.</p>
            </div>
          </div>
        )}
        {error && (
          <div className="banner critical" role="alert">
            {error}
          </div>
        )}

        <div className="editor-section-heading">
          <div>
            <h3>Ресурсы на рабочий день</h3>
            <p>Изменения сразу участвуют в следующем пересчёте маршрутов.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Тип транспорта
            <select
              aria-label="Транспорт специалиста поддержки"
              value={transport}
              disabled={disabled}
              onChange={(event) =>
                setTransport(event.target.value as Transport)
              }
            >
              {Object.entries(transportNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Роутеров с собой
            <input
              aria-label="Оборудование специалиста поддержки"
              type="number"
              min="0"
              max="100"
              step="1"
              value={stock}
              disabled={disabled}
              onChange={(event) => setStock(Number(event.target.value))}
            />
          </label>
        </div>

        {mode === "dispatcher" && (
          <>
            <fieldset>
              <legend>Допуски к работам</legend>
              {Object.entries(skillNames).map(([value, label]) => (
                <label className="checkbox" key={value}>
                  <input
                    type="checkbox"
                    checked={skills.includes(value as Skill)}
                    onChange={(event) =>
                      setSkills((current) =>
                        event.target.checked
                          ? [...current, value as Skill]
                          : current.filter((item) => item !== value),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="permission-toggle">
              <input
                type="checkbox"
                checked={settings.canSelfEdit}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    canSelfEdit: event.target.checked,
                  }))
                }
              />
              <span>
                <b>Разрешить поддержке менять свои данные</b>
                <small>
                  Транспорт, оборудование, постоянные часы и периоды
                  недоступности. Начатые работы всё равно защищены.
                </small>
              </span>
            </label>
          </>
        )}

        <div className="editor-section-heading">
          <div>
            <h3>Постоянный график</h3>
            <p>
              Базовые часы с {w.data.date}. Сохранённые будущие дни
              пересчитываются; более ранние дни сохраняют свой график.
            </p>
          </div>
        </div>
        <div className="week-editor">
          {dayKeys.map((day) => {
            const value = settings.weekly[day];
            return (
              <div
                className={`week-editor-row ${value.enabled ? "active" : ""}`}
                key={day}
              >
                <label className="checkbox day-toggle">
                  <input
                    type="checkbox"
                    checked={value.enabled}
                    disabled={disabled}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        weekly: {
                          ...current.weekly,
                          [day]: { ...value, enabled: event.target.checked },
                        },
                      }))
                    }
                  />
                  <b>{dayNames[day]}</b>
                </label>
                {value.enabled ? (
                  <div className="time-range">
                    <input
                      aria-label={`${dayNames[day]} начало`}
                      type="time"
                      value={value.start}
                      disabled={disabled}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          weekly: {
                            ...current.weekly,
                            [day]: { ...value, start: event.target.value },
                          },
                        }))
                      }
                    />
                    <span>—</span>
                    <input
                      aria-label={`${dayNames[day]} окончание`}
                      type="time"
                      value={value.end}
                      disabled={disabled}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          weekly: {
                            ...current.weekly,
                            [day]: { ...value, end: event.target.value },
                          },
                        }))
                      }
                    />
                  </div>
                ) : (
                  <span className="muted">Выходной</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="editor-section-heading">
          <div>
            <h3>Когда я не могу работать</h3>
            <p>Разовый перерыв, личное время, больничный или выходной.</p>
          </div>
        </div>
        {!disabled && (
          <div className="unavailable-form">
            <input
              aria-label="Дата недоступности"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <input
              aria-label="Недоступен с"
              type="time"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <input
              aria-label="Недоступен до"
              type="time"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
            <input
              aria-label="Причина недоступности"
              value={note}
              maxLength={80}
              onChange={(event) => setNote(event.target.value)}
            />
            <button type="button" onClick={addUnavailable}>
              <Plus size={15} /> Добавить
            </button>
          </div>
        )}
        <div className="unavailable-list">
          {settings.unavailable.length ? (
            settings.unavailable.map((period) => (
              <div key={period.id}>
                <CalendarOff size={16} />
                <span>
                  <b>
                    {new Date(`${period.date}T12:00`).toLocaleDateString(
                      "ru-RU",
                    )}
                  </b>
                  <small>
                    {period.from}–{period.to} · {period.note}
                  </small>
                </span>
                {!disabled && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Удалить недоступность ${period.date} ${period.from}`}
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        unavailable: current.unavailable.filter(
                          (item) => item.id !== period.id,
                        ),
                      }))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="muted">Разовых ограничений пока нет.</p>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            {disabled ? "Закрыть" : "Отмена"}
          </button>
          {!disabled && (
            <button className="primary" type="submit">
              Сохранить и пересчитать
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
