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
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cellBounds, cellFeatures, extrusionHeight, PLACES, type MapCell, type MapMode } from "@/lib/map";
import { useI18n } from "@/lib/i18n/client";
import { searchKey } from "@/lib/places";

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

const LOCALE_EN = {
  "NavigationControl.ZoomIn": "Zoom in",
  "NavigationControl.ZoomOut": "Zoom out",
  "NavigationControl.ResetBearing": "Reset north",
  "FullscreenControl.Enter": "Full screen",
  "FullscreenControl.Exit": "Exit full screen",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
  "AttributionControl.ToggleAttribution": "Show map sources",
  "AttributionControl.MapFeedback": "Map feedback",
  "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + scroll to zoom the map",
  "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + scroll to zoom the map",
  "CooperativeGesturesHandler.MobileHelpText": "Use two fingers to move the map",
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
  /** Shows a box that finds neighbourhoods and districts by name. */
  searchable?: boolean;
}

interface SearchResult {
  key: string;
  label: string;
  meta: string;
  kind: "neighborhood" | "district";
  indexes: number[];
}

const MAX_RESULTS = 8;

/** Neighbourhood and district entries for the search box, each with the cells it covers. */
function buildSearchIndex(cells: MapCell[], districtWord: string) {
  const groups = new Map<string, SearchResult & { search: string }>();
  cells.forEach((cell, index) => {
    if (!cell.title) {
      return;
    }
    const entries: [string, SearchResult["kind"], string, string][] = [
      [`m:${cell.title}|${cell.subtitle ?? ""}`, "neighborhood", cell.title, cell.subtitle ?? ""],
    ];
    if (cell.subtitle && !cell.isDistrictOnly) {
      entries.push([`d:${cell.subtitle}`, "district", cell.subtitle, districtWord]);
    }
    for (const [key, kind, label, meta] of entries) {
      const group = groups.get(key) ?? { key, kind, label, meta, indexes: [], search: searchKey(`${label} ${meta}`) };
      group.indexes.push(index);
      groups.set(key, group);
    }
  });
  return [...groups.values()];
}

/** The page theme: an explicit choice on <html data-theme>, otherwise the system setting. */
function prefersDark() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "dark" || chosen === "light") {
    return chosen === "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
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
  searchable = false,
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
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const searchId = useId();
  const { locale, t } = useI18n();

  const mode = modes[Math.min(modeIndex, modes.length - 1)] ?? DEFAULT_MODE;
  // While the page reloads for a click, the clicked cell is already shown as selected.
  const activeId = isPending && pendingId ? pendingId : selected;
  const bounds = useMemo(() => cellBounds(cells), [cells]);
  const indexById = useMemo(() => new Map(cells.map((cell, index) => [cell.id, index])), [cells]);
  const activeIndex = activeId ? (indexById.get(activeId) ?? -1) : -1;
  const hasPanel = panel !== undefined && panel !== null;
  const searchIndex = useMemo(() => (searchable ? buildSearchIndex(cells, t("İlçe", "District")) : []), [cells, searchable, t]);
  const results = useMemo(() => {
    const key = searchKey(query.trim());
    if (key.length < 2) {
      return [];
    }
    return searchIndex
      .filter((entry) => entry.search.includes(key))
      .sort(
        (a, b) =>
          Number(!searchKey(a.label).startsWith(key)) - Number(!searchKey(b.label).startsWith(key)) ||
          Number(a.kind === "neighborhood") - Number(b.kind === "neighborhood") ||
          a.label.localeCompare(b.label, "tr"),
      )
      .slice(0, MAX_RESULTS);
  }, [query, searchIndex]);

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
    let themeObserver: MutationObserver | null = null;

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
        locale: locale === "en" ? LOCALE_EN : LOCALE,
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

      let dark = prefersDark();
      onSchemeChange = () => {
        // Swap the basemap only when the effective theme really changes.
        if (prefersDark() === dark) {
          return;
        }
        dark = prefersDark();
        usedFallback = false;
        setBasemapFailed(false);
        map.setStyle(dark ? STYLE_DARK : STYLE_LIGHT);
      };
      darkQuery.addEventListener("change", onSchemeChange);
      themeObserver = new MutationObserver(onSchemeChange);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    });

    return () => {
      cancelled = true;
      if (onSchemeChange) {
        darkQuery.removeEventListener("change", onSchemeChange);
      }
      themeObserver?.disconnect();
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

  /** Frames the cells of a search result and selects its strongest cell for the current measure. */
  function focusResult(result: SearchResult) {
    const chosen = result.indexes.map((index) => cells[index]).filter((cell): cell is MapCell => cell !== undefined);
    const area = cellBounds(chosen);
    if (area) {
      mapRef.current?.fitBounds(area, {
        padding: padding(),
        maxZoom: result.kind === "district" ? 13 : 14.6,
        pitch: is3d ? PITCH_3D : 0,
        bearing: is3d ? BEARING_3D : 0,
        duration: prefersReducedMotion() ? 0 : 1500,
        essential: true,
      });
    }
    const strongest = chosen.reduce<MapCell | undefined>((best, cell) => {
      const height = extrusionHeight(cell.levels[modeIndex] ?? 4, mode.extrude);
      return !best || height > extrusionHeight(best.levels[modeIndex] ?? 4, mode.extrude) ? cell : best;
    }, undefined);
    if (strongest) {
      selectCell(strongest.id);
    }
    setQuery(result.label);
    setSearchOpen(false);
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSearchOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveResult((current) => (results.length === 0 ? 0 : (current + step + results.length) % results.length));
    } else if (event.key === "Enter") {
      const result = results[activeResult];
      if (result) {
        event.preventDefault();
        focusResult(result);
      }
    } else if (event.key === "Escape") {
      setSearchOpen(false);
    }
  }

  const hovered = hover ? cells[hover.index] : undefined;
  const flipX = hover ? hover.x > hover.width - 250 : false;
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
          {searchable ? (
            <div className="map-search">
              <span aria-hidden="true" className="map-search-icon" />
              <input
                aria-activedescendant={searchOpen && results[activeResult] ? `${searchId}-${activeResult}` : undefined}
                aria-autocomplete="list"
                aria-controls={`${searchId}-list`}
                aria-expanded={searchOpen && query.trim().length >= 2}
                aria-label={t("Semt ya da ilçe ara", "Search a neighbourhood or district")}
                autoComplete="off"
                onBlur={() => setSearchOpen(false)}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveResult(0);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={onSearchKey}
                placeholder={t("Semt ya da ilçe ara", "Search a place or district")}
                role="combobox"
                type="search"
                value={query}
              />
              {searchOpen && query.trim().length >= 2 ? (
                <ul className="map-search-results" id={`${searchId}-list`} role="listbox">
                  {results.length === 0 ? (
                    <li aria-disabled="true" aria-selected="false" className="map-search-empty" role="option">
                      {t("Eşleşen semt yok", "No matching place")}
                    </li>
                  ) : (
                    results.map((result, index) => (
                      <li
                        aria-selected={index === activeResult}
                        id={`${searchId}-${index}`}
                        key={result.key}
                        onMouseDown={(event) => {
                          // Keeps the input focused until the choice is applied.
                          event.preventDefault();
                          focusResult(result);
                        }}
                        onMouseEnter={() => setActiveResult(index)}
                        role="option"
                      >
                        <span className="place-name">
                          <strong>{result.label}</strong>
                          <span>{result.meta}</span>
                        </span>
                        <span className="result-meta">{t(`${result.indexes.length} hücre`, `${result.indexes.length} cells`)}</span>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          ) : null}
          {modes.length > 1 ? (
            <div className="map-segmented" role="group" aria-label={t("Haritada gösterilen ölçü", "Measure on the map")}>
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
          <div className="map-segmented" role="group" aria-label={t("Görünüm", "View")}>
            <button aria-pressed={!is3d} onClick={() => setIs3d(false)} type="button">
              {t("2B", "2D")}
            </button>
            <button aria-pressed={is3d} onClick={() => setIs3d(true)} type="button">
              {t("3B", "3D")}
            </button>
          </div>
          <div className="map-places" role="group" aria-label={t("Hızlı git", "Go to")}>
            <button onClick={showCity} type="button">
              {t("Tüm şehir", "Whole city")}
            </button>
            {PLACES.map((place) => (
              <button key={place.label} onClick={() => flyTo(place.longitude, place.latitude, place.zoom)} type="button">
                {t(place.label, place.labelEn)}
              </button>
            ))}
          </div>
        </div>

        <div className="map-legend">
          <div className="map-legend-title">
            {mode.label}
            {is3d ? <span>{t(" · yükseklik de aynı ölçüyü gösterir", " · height shows the same measure")}</span> : null}
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
              {basemapFailed ? t("Harita altlığı yüklenemedi, yalnızca hücreler gösteriliyor.", "The base map could not load, only the cells are shown.") : note}
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
            <div className="tooltip-place">
              <strong>{hovered.title ?? `${t("Hücre", "Cell")} ${hovered.id}`}</strong>
              <span>{hovered.subtitle ?? t("Semt adı yok", "No place name")}</span>
            </div>
            {hovered.lines.map((line) => (
              <div className="tooltip-row" key={line.label}>
                <strong>{line.value}</strong>
                <span>{line.label}</span>
              </div>
            ))}
            {selectParam ? <div className="tooltip-note">{t("Ayrıntı için tıklayın", "Click for details")}</div> : null}
          </div>
        ) : null}
      </div>

      {hasPanel ? (
        <aside aria-label={t("Seçili hücre", "Selected cell")} className="map-panel" aria-busy={isPending}>
          {panel}
        </aside>
      ) : null}
    </div>
  );
}
