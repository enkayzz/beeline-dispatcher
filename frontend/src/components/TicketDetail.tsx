import { useState } from "react";
import { Pencil, MapPin, Clock, LockKeyhole, CheckCircle2 } from "lucide-react";
import { Modal, Badge } from "./ui";
import {
  assignmentFor,
  locked,
  ticketStatus,
  workNames,
  ownerNames,
  type Assignment,
  type Role,
  type Status,
  type Workspace,
} from "../domain/workspace";
import { clock } from "../api";
import { skillNames, transportNames } from "../types";
export default function TicketDetail({
  w,
  id,
  role,
  onClose,
  onEdit,
  onAssign,
  onRelease,
  onStatus,
}: {
  w: Workspace;
  id: string;
  role: Role;
  onClose: () => void;
  onEdit: () => void;
  onAssign: (a: Assignment) => void;
  onRelease: () => void;
  onStatus: (status: Status, progress: number, note: string) => void;
}) {
  const j = w.data.jobs.find((j) => j.id === id)!,
    info = w.tickets[id],
    a = assignmentFor(w.current, id),
    status = ticketStatus(w, j),
    isLocked = locked(status);
  const [engineer, setEngineer] = useState(
    a?.engineerId ?? w.data.engineers[0]?.id ?? "",
  );
  const [start, setStart] = useState(a ? clock(a.stop.start) : j.window[0]);
  const [nextStatus, setNextStatus] = useState<Status>(status);
  const [progress, setProgress] = useState(info.progress);
  const [note, setNote] = useState(info.note),
    [error, setError] = useState("");
  const canUpdate = role === "dispatcher" || info.owner === "support-1";
  const reason = w.current?.unassigned.find((u) => u.jobId === id)?.reason;
  function perform(fn: () => void) {
    setError("");
    try {
      fn();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={`Заявка № ${id}`} wide onClose={onClose}>
      <div className="detail-title">
        <div>
          <h3>{j.title}</h3>
          <p>
            <MapPin size={14} />
            {j.address}
          </p>
        </div>
        <Badge status={status} />
      </div>
      {error && (
        <div className="banner critical" role="alert">
          {error}
        </div>
      )}
      {reason && (
        <div className="banner warning">
          <strong>Требует внимания</strong>
          <p>{reason}</p>
          {canUpdate && (
            <button onClick={onEdit}>
              <Pencil size={14} />
              Исправить условия заявки
            </button>
          )}
        </div>
      )}
      <div className="detail-grid">
        <div>
          <span>Тип работ</span>
          <b>{workNames[info.workType]}</b>
        </div>
        <div>
          <span>Клиентское окно</span>
          <b>{j.window.join("–")}</b>
        </div>
        <div>
          <span>Поддержка</span>
          <b>{ownerNames[info.owner] || info.owner}</b>
        </div>
        <div>
          <span>Контакт</span>
          <b>{info.contact || "Не указан"}</b>
        </div>
        <div>
          <span>Навык / транспорт</span>
          <b>
            {skillNames[j.skill]} ·{" "}
            {j.transport ? transportNames[j.transport] : "Любой"}
          </b>
        </div>
        <div>
          <span>Ресурсы</span>
          <b>
            {j.duration} мин работы · {info.routers} роутеров
          </b>
        </div>
      </div>
      {a && (
        <div className="itinerary">
          <div>
            <Clock size={17} />
            <span>
              Прибытие <b>{clock(a.stop.arrival)}</b>
            </span>
          </div>
          <div>
            <span>
              Начало <b>{clock(a.stop.start)}</b>
            </span>
          </div>
          <div>
            <span>
              Завершение <b>{clock(a.stop.end)}</b>
            </span>
          </div>
        </div>
      )}
      {isLocked && (
        <div className="banner neutral">
          <LockKeyhole size={16} />
          <span>
            Назначение зафиксировано по фактическому статусу. Планировщик
            сохраняет эту работу.
          </span>
        </div>
      )}
      {role === "dispatcher" && !isLocked && status !== "cancelled" && (
        <section className="detail-section">
          <div className="section-title">
            <h3>{a ? "Корректировка расписания" : "Назначить заявку"}</h3>
            {w.manual[id] && (
              <span className="badge neutral">Ручное назначение</span>
            )}
          </div>
          <p className="muted">
            Укажите инженера и начало. Остальные заявки будут пересчитаны с
            учётом дороги и ограничений.
          </p>
          <div className="form-grid">
            <label>
              Исполнитель
              <select
                aria-label="Исполнитель"
                value={engineer}
                onChange={(e) => setEngineer(e.target.value)}
              >
                {w.data.engineers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {transportNames[e.transport]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Начало работы
              <input
                aria-label="Начало работы"
                type="time"
                value={start}
                required
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
          </div>
          <div className="actions">
            <button
              className="primary"
              onClick={() =>
                perform(() => {
                  if (!start) throw new Error("Укажите начало работы.");
                  onAssign({ engineerId: engineer, start });
                })
              }
            >
              Назначить и пересчитать
            </button>
            {w.manual[id] && (
              <button onClick={() => perform(onRelease)}>Снять фиксацию</button>
            )}
          </div>
        </section>
      )}
      {canUpdate && (
        <section className="detail-section">
          <h3>Статус и выполнение</h3>
          <p className="muted">
            {role === "support"
              ? "Обновляйте по информации от инженера. Завершение подтверждает диспетчер."
              : "Подтверждайте фактическое состояние по информации от бригады."}
          </p>
          <div className="form-grid">
            <label>
              Статус заявки
              <select
                value={nextStatus}
                onChange={(e) => {
                  const v = e.target.value as Status;
                  setNextStatus(v);
                  if (v === "review" || v === "completed") setProgress(100);
                  if (v === "new" || v === "assigned") setProgress(0);
                }}
                disabled={status === "completed" || status === "cancelled"}
              >
                {!a && <option value="new">Новая</option>}
                {a && (
                  <>
                    <option value="assigned">Назначена</option>
                    <option value="enroute">В пути</option>
                    <option value="in_progress">В работе</option>
                    <option value="review">Ожидает закрытия</option>
                    {role === "dispatcher" && (
                      <option value="completed">Завершена</option>
                    )}
                  </>
                )}
                <option value="cancelled">Отменена</option>
                {status === "completed" && role !== "dispatcher" && (
                  <option value="completed">Завершена</option>
                )}
              </select>
            </label>
            <label>
              Выполнение заявки
              <select
                aria-label="Выполнение заявки"
                value={progress}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setProgress(v);
                  if (v === 100) setNextStatus("review");
                  else if (v > 0) setNextStatus("in_progress");
                }}
                disabled={
                  !a || status === "completed" || status === "cancelled"
                }
              >
                {[0, 25, 50, 75, 100].map((v) => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </select>
            </label>
            <label className="span-2">
              Комментарий по заявке
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
              />
            </label>
          </div>
          <div className="actions">
            <button
              onClick={() =>
                perform(() => onStatus(nextStatus, progress, note))
              }
              disabled={status === "completed" || status === "cancelled"}
            >
              <CheckCircle2 size={16} />
              Сохранить статус
            </button>
            {!isLocked && status !== "cancelled" && (
              <button onClick={onEdit}>
                <Pencil size={15} />
                Редактировать заявку
              </button>
            )}
          </div>
        </section>
      )}
      <section className="detail-section">
        <h3>История заявки</h3>
        {w.history.filter((h) => h.jobId === id).length ? (
          <ol className="history">
            {w.history
              .filter((h) => h.jobId === id)
              .slice(0, 8)
              .map((h, i) => (
                <li key={i}>
                  <b>{h.text}</b>
                  <small>
                    {h.actor} · {new Date(h.at).toLocaleString("ru-RU")}
                  </small>
                </li>
              ))}
          </ol>
        ) : (
          <p className="muted">
            Заявка из демонстрационного набора. Новые действия появятся здесь.
          </p>
        )}
      </section>
    </Modal>
  );
}
