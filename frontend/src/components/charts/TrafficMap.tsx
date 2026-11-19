"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { cellBounds, cellFeatures, PLACES, type MapCell, type MapMode } from "@/lib/map";

export type { MapCell, MapMode } from "@/lib/map";

const WORKER_URL = "/vendor/maplibre-gl-worker.mjs";
const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/positron";
const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
const SOURCE_ID = "cells";
const FILL_LAYER = "cells-fill";
const EXTRUSION_LAYER = "cells-3d";
const OUTLINE_LAYER = "cells-outline";
const PITCH_3D = 58;
const BEARING_3D = -17;
const PANEL_WIDTH = 340;
const DEFAULT_MODE: MapMode = {
  id: "default",
  label: "Değer",
  palette: "div",
  legend: { low: "Düşük", high: "Yüksek" },
  extrude: "magnitude",
};

const LOCALE = {
  "NavigationControl.ZoomIn": "Yakınlaştır",
  "NavigationControl.ZoomOut": "Uzaklaştır",
  "NavigationControl.ResetBearing": "Kuzeye döndür",
  "FullscreenControl.Enter": "Tam ekran",
  "FullscreenControl.Exit": "Tam ekrandan çık",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
  "AttributionControl.ToggleAttribution": "Harita kaynaklarını göster",
  "AttributionControl.MapFeedback": "Harita geri bildirimi",
  "CooperativeGesturesHandler.WindowsHelpText": "Haritayı yakınlaştırmak için Ctrl + kaydırma kullanın",
  "CooperativeGesturesHandler.MacHelpText": "Haritayı yakınlaştırmak için ⌘ + kaydırma kullanın",
  "CooperativeGesturesHandler.MobileHelpText": "Haritayı hareket ettirmek için iki parmak kullanın",
};

interface Hover {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TrafficMapProps {
  ariaLabel: string;
  cells: MapCell[];
  modes: MapMode[];
  /** When set, clicking a cell writes its id to this URL parameter. */
  selectParam?: string;
  selected?: string | null;
  /** Floating card for the selected cell; it moves below the map on narrow screens. */
  panel?: ReactNode;
  /** Requires Ctrl + scroll to zoom, for maps inside long pages. */
  cooperative?: boolean;
  /** Short note under the legend, such as what one cell measures. */
  note?: string;
  /** A shorter map for use inside long pages. */
  compact?: boolean;
}

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function colorExpression(palette: MapMode["palette"]): ExpressionSpecification {
  const stops = [1, 2, 3, 4, 5, 6, 7].flatMap((level) => [level, cssVar(`--${palette}-${level}`)]);
  return ["match", ["get", "level"], ...stops, cssVar(`--${palette}-4`)] as unknown as ExpressionSpecification;
}

const flag = (name: "hover" | "selected"): ExpressionSpecification => ["boolean", ["feature-state", name], false];

/** A plain background used when the basemap tiles cannot be reached, so the cells still render. */
function fallbackStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": cssVar("--page") || "#f9f9f7" } }],
  };
}

/** Softer land, blue water and green parks, so the base map reads like a city map under the data. */
const BASEMAP_TINT: Record<"light" | "dark", Record<string, string>> = {
  light: {
    background: "#f3f2ee",
    water: "#c6dbef",
    park: "#dde8d5",
    landuse_park: "#dde8d5",
    landcover_wood: "#d6e3cf",
    landuse_residential: "#ecebe6",
    building: "#e3e2dc",
  },
  dark: {
    background: "#161615",
    water: "#12263b",
    park: "#1a281d",
    landuse_park: "#1a281d",
    landcover_wood: "#1c2b1f",
    landuse_residential: "#1c1c1b",
    building: "#242423",
  },
};

function tintBasemap(map: MapLibreMap) {
  const tint = BASEMAP_TINT[prefersDark() ? "dark" : "light"];
  for (const [layer, color] of Object.entries(tint)) {
    const style = map.getLayer(layer);
    if (!style) {
      continue;
    }
    map.setPaintProperty(layer, style.type === "background" ? "background-color" : "fill-color", color);
  }
}

function firstSymbolLayer(map: MapLibreMap): string | undefined {
  return map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
}

export function TrafficMap({
  ariaLabel,
  cells,
  modes,
  selectParam,
  selected = null,
  panel,
  cooperative = false,
  note,
  compact = false,
}: TrafficMapProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const shellRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const [modeIndex, setModeIndex] = useState(0);
  const [is3d, setIs3d] = useState(false);
  const [styleVersion, setStyleVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [basemapFailed, setBasemapFailed] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const mode = modes[Math.min(modeIndex, modes.length - 1)] ?? DEFAULT_MODE;
  // While the page reloads for a click, the clicked cell is already shown as selected.
  const activeId = isPending && pendingId ? pendingId : selected;
  const bounds = useMemo(() => cellBounds(cells), [cells]);
  const indexById = useMemo(() => new Map(cells.map((cell, index) => [cell.id, index])), [cells]);
  const activeIndex = activeId ? (indexById.get(activeId) ?? -1) : -1;
  const hasPanel = panel !== undefined && panel !== null;

  // Latest values for map event handlers, which are registered once.
  const latest = useRef({ cells, mode, modeIndex, is3d, activeIndex, hasPanel });
  useLayoutEffect(() => {
    latest.current = { cells, mode, modeIndex, is3d, activeIndex, hasPanel };
  });

  const padding = useCallback(() => {
    const wide = (shellRef.current?.clientWidth ?? 0) >= 900;
    const toolbar = toolbarRef.current;
    const top = toolbar ? toolbar.offsetTop + toolbar.offsetHeight + 16 : 104;
    return {
      top,
      bottom: wide ? 64 : 96,
      left: wide ? 32 : 16,
      right: wide && latest.current.hasPanel ? PANEL_WIDTH + 48 : wide ? 32 : 16,
    };
  }, []);

  const selectCell = useCallback(
    (id: string) => {
      if (!selectParam) {
        return;
      }
      setPendingId(id);
      lastClicked.current = id;
      const query = new URLSearchParams(searchParams);
      query.set(selectParam, id);
      startTransition(() => router.replace(`${pathname}?${query}`, { scroll: false }));
    },
    [pathname, router, searchParams, selectParam],
  );
  const lastClicked = useRef<string | null>(null);
  const selectRef = useRef(selectCell);
  useLayoutEffect(() => {
    selectRef.current = selectCell;
  });

  // Create the map once. Data, mode and selection are synced by the effects below.
  useEffect(() => {
    const container = canvasRef.current;
    if (!container || !bounds) {
      return;
    }
    let cancelled = false;
    let usedFallback = false;
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    let onSchemeChange: (() => void) | null = null;

    void import("maplibre-gl").then(({ Map, NavigationControl, FullscreenControl, ScaleControl, AttributionControl, setWorkerUrl }) => {
      if (cancelled) {
        return;
      }
      setWorkerUrl(WORKER_URL);
      const map = new Map({
        container,
        style: prefersDark() ? STYLE_DARK : STYLE_LIGHT,
        bounds,
        fitBoundsOptions: { padding: padding() },
        minZoom: 8,
        maxZoom: 17,
        maxPitch: 70,
        attributionControl: false,
        cooperativeGestures: cooperative,
        locale: LOCALE,
        fadeDuration: 150,
      });
      mapRef.current = map;

      map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
      if (shellRef.current) {
        map.addControl(new FullscreenControl({ container: shellRef.current }), "top-right");
      }
      map.addControl(new ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-right");
      map.addControl(new AttributionControl({ compact: true }), "bottom-right");

      map.on("style.load", () => setStyleVersion((version) => version + 1));
      map.on("load", () => {
        setLoaded(true);
        // The source credits start collapsed behind the info button so they do not cover the legend.
        const attribution = container.querySelector("details.maplibregl-ctrl-attrib");
        attribution?.removeAttribute("open");
        attribution?.classList.remove("maplibregl-compact-show");
      });
      map.on("error", (event) => {
        // Missing basemap tiles or style: keep the data visible on a plain background.
        if (!usedFallback && !map.isStyleLoaded() && !(event.error?.message ?? "").includes("cells")) {
          usedFallback = true;
          setBasemapFailed(true);
          map.setStyle(fallbackStyle());
        }
      });

      const onMove = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature || typeof feature.id !== "number") {
          return;
        }
        map.getCanvas().style.cursor = selectParam ? "pointer" : "crosshair";
        const canvas = map.getCanvas();
        setHover({
          index: feature.id,
          x: event.point.x,
          y: event.point.y,
          width: canvas.clientWidth,
          height: canvas.clientHeight,
        });
      };
      const onLeave = () => {
        map.getCanvas().style.cursor = "";
        setHover(null);
      };
      const onClick = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        if (typeof id === "string") {
          selectRef.current(id);
        }
      };
      for (const layer of [FILL_LAYER, EXTRUSION_LAYER]) {
        map.on("mousemove", layer, onMove);
        map.on("mouseleave", layer, onLeave);
        map.on("click", layer, onClick);
      }

      onSchemeChange = () => {
        usedFallback = false;
        setBasemapFailed(false);
        map.setStyle(darkQuery.matches ? STYLE_DARK : STYLE_LIGHT);
      };
      darkQuery.addEventListener("change", onSchemeChange);
    });

    return () => {
      cancelled = true;
      if (onSchemeChange) {
        darkQuery.removeEventListener("change", onSchemeChange);
      }
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes are applied by the sync effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)build the cell layers whenever a style finishes loading, and sync data, colors and 3D state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) {
      return;
    }
    const { cells: currentCells, mode: currentMode, modeIndex: currentIndex, is3d: extruded } = latest.current;
    const data = cellFeatures(currentCells, currentIndex, currentMode.extrude);
    const colors = colorExpression(currentMode.palette);
    const ink = cssVar("--ink");
    const surface = cssVar("--surface");

    const source = map.getSource<GeoJSONSource>(SOURCE_ID);
    if (!source) {
      tintBasemap(map);
    }
    if (source) {
      source.setData(data);
    } else {
      map.addSource(SOURCE_ID, { type: "geojson", data });
    }

    const beforeId = firstSymbolLayer(map);
    if (!map.getLayer(FILL_LAYER)) {
      map.addLayer(
        {
          id: FILL_LAYER,
          type: "fill",
          source: SOURCE_ID,
          paint: {
            "fill-color": colors,
            "fill-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.9, 12, 0.8, 15, 0.55],
          },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: EXTRUSION_LAYER,
          type: "fill-extrusion",
          source: SOURCE_ID,
          paint: {
            "fill-extrusion-color": colors,
            // Columns shrink as the map zooms in, so close-up views stay readable.
            "fill-extrusion-height": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              ["get", "height"],
              12,
              ["*", ["get", "height"], 0.4],
              14,
              ["*", ["get", "height"], 0.12],
              16,
              ["*", ["get", "height"], 0.05],
            ],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.95, 13, 0.82, 15, 0.7],
            "fill-extrusion-vertical-gradient": true,
          },
        },
        beforeId,
      );
      map.addLayer({
        id: OUTLINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": ink,
          "line-width": ["case", flag("selected"), 2.5, flag("hover"), 1.5, 0],
          "line-gap-width": ["case", flag("selected"), 1, 0],
          "line-opacity": ["case", ["any", flag("selected"), flag("hover")], 1, 0],
        },
      });
    } else {
      map.setPaintProperty(FILL_LAYER, "fill-color", colors);
      map.setPaintProperty(OUTLINE_LAYER, "line-color", ink);
    }
    map.setPaintProperty(EXTRUSION_LAYER, "fill-extrusion-color", [
      "case",
      flag("selected"),
      ink,
      flag("hover"),
      surface,
      colors,
    ] as unknown as ExpressionSpecification);
    map.setLayoutProperty(FILL_LAYER, "visibility", extruded ? "none" : "visible");
    map.setLayoutProperty(EXTRUSION_LAYER, "visibility", extruded ? "visible" : "none");

    const { activeIndex: index } = latest.current;
    map.removeFeatureState({ source: SOURCE_ID });
    if (index >= 0) {
      map.setFeatureState({ source: SOURCE_ID, id: index }, { selected: true });
    }
  }, [styleVersion, cells, modeIndex, is3d]);

  // Selection highlight.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0 || !map.getSource(SOURCE_ID)) {
      return;
    }
    for (let index = 0; index < cells.length; index += 1) {
      map.removeFeatureState({ source: SOURCE_ID, id: index }, "selected");
    }
    if (activeIndex >= 0) {
      map.setFeatureState({ source: SOURCE_ID, id: activeIndex }, { selected: true });
    }
  }, [activeIndex, cells.length, styleVersion]);

  // Hover highlight.
  const hoverIndex = hover?.index ?? -1;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hoverIndex < 0 || !map.getSource(SOURCE_ID)) {
      return;
    }
    map.setFeatureState({ source: SOURCE_ID, id: hoverIndex }, { hover: true });
    return () => {
      if (map.getSource(SOURCE_ID)) {
        map.setFeatureState({ source: SOURCE_ID, id: hoverIndex }, { hover: false });
      }
    };
  }, [hoverIndex]);

  // Camera for the 3D toggle.
  const firstToggle = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (firstToggle.current) {
      firstToggle.current = false;
      return;
    }
    if (!map) {
      return;
    }
    map.easeTo({
      pitch: is3d ? PITCH_3D : 0,
      bearing: is3d ? BEARING_3D : 0,
      duration: prefersReducedMotion() ? 0 : 900,
    });
  }, [is3d]);

  // A cell chosen outside the map (the table) is brought into view. Clicks on the map are not moved.
  const previousSelected = useRef(selected);
  useEffect(() => {
    if (previousSelected.current === selected) {
      return;
    }
    previousSelected.current = selected;
    if (selected === lastClicked.current) {
      return;
    }
    const map = mapRef.current;
    const cell = selected ? cells[indexById.get(selected) ?? -1] : undefined;
    if (map && cell) {
      map.flyTo({
        center: [cell.longitude, cell.latitude],
        zoom: Math.max(map.getZoom(), 13.2),
        padding: padding(),
        duration: prefersReducedMotion() ? 0 : 1400,
        essential: true,
      });
    }
  }, [selected, cells, indexById, padding]);

  function flyTo(longitude: number, latitude: number, zoom: number) {
    mapRef.current?.flyTo({
      center: [longitude, latitude],
      zoom,
      pitch: is3d ? PITCH_3D : 0,
      bearing: is3d ? BEARING_3D : 0,
      padding: padding(),
      duration: prefersReducedMotion() ? 0 : 1600,
      essential: true,
    });
  }

  function showCity() {
    if (!bounds) {
      return;
    }
    mapRef.current?.fitBounds(bounds, {
      padding: padding(),
      pitch: is3d ? PITCH_3D : 0,
      bearing: is3d ? BEARING_3D : 0,
      duration: prefersReducedMotion() ? 0 : 1200,
    });
  }

  const hovered = hover ? cells[hover.index] : undefined;
  const flipX = hover ? hover.x > hover.width - 230 : false;
  const flipY = hover ? hover.y < 120 : false;

  return (
    <div className={hasPanel ? "traffic-map-shell with-panel" : "traffic-map-shell"} ref={shellRef}>
      <div className={compact ? "traffic-map compact" : "traffic-map"} aria-busy={isPending || !loaded}>
        <div aria-label={ariaLabel} className="traffic-map-canvas" ref={canvasRef} role="region" />

        {!loaded ? (
          <div className="traffic-map-loading" aria-hidden="true">
            <span />
          </div>
        ) : null}

        <div className="map-toolbar" ref={toolbarRef}>
          {modes.length > 1 ? (
            <div className="map-segmented" role="group" aria-label="Haritada gösterilen ölçü">
              {modes.map((item, index) => (
                <button
                  aria-pressed={index === modeIndex}
                  key={item.id}
                  onClick={() => setModeIndex(index)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="map-segmented" role="group" aria-label="Görünüm">
            <button aria-pressed={!is3d} onClick={() => setIs3d(false)} type="button">
              2B
            </button>
            <button aria-pressed={is3d} onClick={() => setIs3d(true)} type="button">
              3B
            </button>
          </div>
          <div className="map-places" role="group" aria-label="Hızlı git">
            <button onClick={showCity} type="button">
              Tüm şehir
            </button>
            {PLACES.map((place) => (
              <button key={place.label} onClick={() => flyTo(place.longitude, place.latitude, place.zoom)} type="button">
                {place.label}
              </button>
            ))}
          </div>
        </div>

        <div className="map-legend">
          <div className="map-legend-title">
            {mode.label}
            {is3d ? <span> · yükseklik de aynı ölçüyü gösterir</span> : null}
          </div>
          <div className="map-legend-scale" aria-hidden="true">
            {[1, 2, 3, 4, 5, 6, 7].map((level) => (
              <span key={level} style={{ background: `var(--${mode.palette}-${level})` }} />
            ))}
          </div>
          <div className="map-legend-labels">
            <span>{mode.legend.low}</span>
            <span>{mode.legend.high}</span>
          </div>
          {note || basemapFailed ? (
            <div className={basemapFailed ? "map-legend-note warn" : "map-legend-note"}>
              {basemapFailed ? "Harita altlığı yüklenemedi, yalnızca hücreler gösteriliyor." : note}
            </div>
          ) : null}
        </div>

        {hovered && hover ? (
          <div
            className="tooltip map-tooltip"
            style={{
              transform: `translate(${flipX ? hover.x - 16 : hover.x + 16}px, ${flipY ? hover.y + 16 : hover.y - 16}px) translate(${flipX ? "-100%" : "0"}, ${flipY ? "0" : "-100%"})`,
            }}
          >
            <div className="tooltip-title">
              Hücre <span className="mono">{hovered.id}</span>
            </div>
            {hovered.lines.map((line) => (
              <div className="tooltip-row" key={line.label}>
                <strong>{line.value}</strong>
                <span>{line.label}</span>
              </div>
            ))}
            {selectParam ? <div className="tooltip-note">Ayrıntı için tıklayın</div> : null}
          </div>
        ) : null}
      </div>

      {hasPanel ? (
        <aside aria-label="Seçili hücre" className="map-panel" aria-busy={isPending}>
          {panel}
        </aside>
      ) : null}
    </div>
  );
}
