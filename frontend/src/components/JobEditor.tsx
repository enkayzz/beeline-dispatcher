import { useState, type FormEvent } from "react";
import type { Job, Transport } from "../types";
import { transportNames } from "../types";
import {
  serviceMinutes,
  workNames,
  type TicketInfo,
  type WorkType,
  type Workspace,
} from "../domain/workspace";
import { Modal } from "./ui";
export default function JobEditor({
  workspace: w,
  job,
  initialType,
  onSave,
  onClose,
}: {
  workspace: Workspace;
  job?: Job;
  initialType?: WorkType;
  onSave: (job: Job, info: TicketInfo) => void;
  onClose: () => void;
}) {
  const old = job && w.tickets[job.id];
  const [kind, setKind] = useState<WorkType>(
    old?.workType ?? initialType ?? "connection",
  );
  const [error, setError] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) || "").trim();
    const window: [string, string] = [text("from"), text("to")];
    const point: [number, number] = [
      Number(f.get("lat")),
      Number(f.get("lon")),
    ];
    if (!text("title") || !text("address")) {
      setError("Укажите название и адрес.");
      return;
    }
    if (window[0] > window[1]) {
      setError("Конец окна должен быть не раньше начала.");
      return;
    }
    if (text("receivedAt") > window[1]) {
      setError("Время поступления позже клиентского окна.");
      return;
    }
    const value: Job = {
      id: job?.id ?? `REQ-${Date.now().toString(36).toUpperCase()}`,
      title: text("title"),
      address: text("address"),
      point,
      window,
      skill: kind === "equipment" ? "local" : kind,
      duration: serviceMinutes[kind],
      priority: kind === "emergency" ? "urgent" : "normal",
      transport: (text("transport") || undefined) as Transport | undefined,
    };
    const info: TicketInfo = {
      ...old,
      owner: old?.owner ?? "support-1",
      status: old?.status ?? "new",
      progress: old?.progress ?? 0,
      workType: kind,
      contact: text("contact"),
      note: text("note"),
      routers: Number(f.get("routers")),
      receivedAt: text("receivedAt"),
    };
    try {
      onSave(value, info);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={job ? `Редактирование заявки № ${job.id}` : "Новая заявка"}
      wide
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <p className="muted">
          Рабочий день{" "}
          {new Date(w.data.date + "T12:00").toLocaleDateString("ru-RU")} ·{" "}
          {w.data.name}
        </p>
        {error && (
          <div className="banner critical" role="alert">
            {error}
          </div>
        )}
        <div className="form-grid">
          <label className="span-2">
            Название заявки
            <input
              name="title"
              defaultValue={job?.title}
              placeholder="Например, подключить домашний интернет"
              required
              maxLength={160}
            />
          </label>
          <label>
            Тип работ
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as WorkType)}
            >
              {Object.entries(workNames).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Время поступления
            <input
              name="receivedAt"
              type="time"
              required
              defaultValue={old?.receivedAt ?? "09:00"}
            />
          </label>
          <label className="span-2">
            Адрес
            <input
              name="address"
              defaultValue={job?.address}
              placeholder="Москва, улица, дом"
              required
              maxLength={250}
            />
          </label>
          <label>
            Окно клиента, с
            <input
              name="from"
              type="time"
              defaultValue={job?.window[0] ?? "09:00"}
              required
            />
          </label>
          <label>
            Окно клиента, до
            <input
              name="to"
              type="time"
              defaultValue={job?.window[1] ?? "18:00"}
              required
            />
          </label>
          <label>
            Контакт клиента
            <input
              name="contact"
              defaultValue={old?.contact}
              placeholder="Имя или телефон"
              maxLength={100}
            />
          </label>
          <label>
            Роутеры, шт.
            <input
              name="routers"
              type="number"
              min="0"
              max="30"
              step="1"
              defaultValue={
                old?.routers ?? (initialType === "emergency" ? 0 : 1)
              }
              required
            />
          </label>
          <label>
            Требование к транспорту
            <select name="transport" defaultValue={job?.transport ?? ""}>
              <option value="">Любой транспорт</option>
              {Object.entries(transportNames).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="field-info">
            <span>Работа и документы</span>
            <strong>{serviceMinutes[kind]} мин</strong>
            <small>Дорога рассчитывается отдельно</small>
          </div>
          <label>
            Широта
            <input
              name="lat"
              type="number"
              step="any"
              min="-90"
              max="90"
              defaultValue={job?.point[0]}
              required
              placeholder="55.704"
            />
          </label>
          <label>
            Долгота
            <input
              name="lon"
              type="number"
              step="any"
              min="-180"
              max="180"
              defaultValue={job?.point[1]}
              required
              placeholder="37.779"
            />
          </label>
          <p className="field-help span-2">
            Укажите координаты адреса: автоматическое геокодирование ещё не
            подключено.
          </p>
          <label className="span-2">
            Комментарий
            <textarea
              name="note"
              rows={3}
              defaultValue={old?.note}
              maxLength={1000}
              placeholder="Домофон, доступ в помещение, пожелания клиента"
            />
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button className="primary" type="submit">
            {job ? "Сохранить изменения" : "Создать заявку"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
