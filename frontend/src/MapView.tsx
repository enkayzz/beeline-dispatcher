import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Dataset, Plan } from "./types";
import { LocateFixed, Map as MapIcon, Minus, Plus } from "lucide-react";

export default function MapView({
  data,
  plan,
  selectedId,
  engineerId,
  onSelect,
}: {
  data: Dataset;
  plan?: Plan;
  selectedId?: string;
  engineerId?: string;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([55.705, 37.738], 12);
    const tiles = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      },
    ).addTo(m);
    tiles.on("tileerror", () => setOffline(true));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current,
      l = layer.current;
    if (!m || !l) return;
    l.clearLayers();
    const routeByJob = new Map(
      plan?.routes.flatMap((r) => r.stops.map((s, i) => [s.jobId, { r, i }])),
    );
    for (const r of plan?.routes ?? []) {
      if (!r.stops.length) continue;
      const e = data.engineers.find((e) => e.id === r.engineerId)!;
      const muted = !!engineerId && engineerId !== e.id;
      const points = [
        e.start,
        ...r.stops.map((s) => data.jobs.find((j) => j.id === s.jobId)!.point),
      ];
      L.polyline(points, {
        color: e.color,
        weight: muted ? 2 : 4,
        opacity: muted ? 0.15 : 0.85,
        lineCap: "round",
        dashArray: "9 7",
      }).addTo(l);
      L.marker(e.start, {
        icon: L.divIcon({
          className: "",
          html: `<div class="depot" style="--pin:${e.color}">⌂</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      })
        .bindTooltip(`Старт: ${e.name.replace(/[<>&]/g, "")}`)
        .addTo(l);
    }
    for (const j of data.jobs) {
      const assigned = routeByJob.get(j.id),
        e = data.engineers.find((e) => e.id === assigned?.r.engineerId);
      const selected = j.id === selectedId,
        muted = !!engineerId && e?.id !== engineerId;
      const color = plan && !assigned ? "#d88d30" : (e?.color ?? "#283c48");
      const pin = L.marker(j.point, {
        opacity: muted ? 0.35 : 1,
        zIndexOffset: selected ? 1000 : 100,
        icon: L.divIcon({
          className: "",
          html: `<div class="map-pin ${selected ? "selected" : ""} ${j.priority === "urgent" ? "urgent" : ""}" style="--pin:${color}">${plan && !assigned ? "!" : assigned ? assigned.i + 1 : "•"}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
      }).addTo(l);
      const tooltip = document.createElement("span");
      tooltip.textContent = `№ ${j.id} · ${j.title}`;
      pin
        .bindTooltip(tooltip, { direction: "top" })
        .on("click", () => onSelect(j.id));
      const element = pin.getElement();
      if (element) {
        element.setAttribute("aria-label", `Заявка ${j.id}`);
        element.setAttribute("role", "button");
        element.setAttribute("tabindex", "0");
        element.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(j.id);
          }
        });
      }
    }
  }, [data, plan, selectedId, engineerId, onSelect]);
  const fit = () =>
    map.current?.fitBounds(L.latLngBounds(data.jobs.map((j) => j.point)), {
      padding: [55, 55],
      maxZoom: 13,
    });
  useEffect(() => {
    fit();
  }, [data]); // Keep selection stable; fit only when the dataset changes.
  return (
    <div className="map-shell">
      <div
        ref={container}
        className="map-canvas"
        aria-label="Карта заявок и маршрутов"
      />
      <div className="map-label">
        <MapIcon size={15} />
        <span>
          Москва <b>·</b> рабочие маршруты
        </span>
      </div>
      <div className="map-controls">
        <button
          aria-label="Приблизить карту"
          onClick={() => map.current?.zoomIn()}
        >
          <Plus size={18} />
        </button>
        <button
          aria-label="Отдалить карту"
          onClick={() => map.current?.zoomOut()}
        >
          <Minus size={18} />
        </button>
        <button aria-label="Показать все заявки" onClick={fit}>
          <LocateFixed size={18} />
        </button>
      </div>
      <div className="map-footnote">
        {offline
          ? "Подложка недоступна · точки и маршруты доступны"
          : "© OpenStreetMap"}
        <span>Прямые отрезки · оценка по координатам</span>
      </div>
    </div>
  );
}
