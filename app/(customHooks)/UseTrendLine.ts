import React, { useRef, useEffect } from "react";
import {
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  UTCTimestamp,
  Time,
  Logical,
  SeriesType,
} from "lightweight-charts";
import { SelectedTools } from "../(store)/SelectedTools";
import { TrendLine } from "../(plugins)/TrendLines";
import UseTrendLineFn from "./TrendLine";
import RayLine from "./RayLine";
import InfoLine from "./InfoLine";
import ExtendedLine from "./ExtendedLine";
import TrendAngle from "./TrendAngle";
import HorizontalLine from "./HorizontalLine"; // Updated to class-based
import VerticalLine from "./VerticalLine"; // Updated to class-based
import { PositionTool } from "../(plugins)/TrendPosition";
import { useSelector } from "../(store)/SelectedSymbol";

interface Point {
  time: Time;
  price: number;
  logical?: Logical;
}

export default function useTrendLine(
  chartRef: React.RefObject<IChartApi | null>,
  candlestickSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  containerRef: React.RefObject<HTMLDivElement | null>, // NEW: For mouse listeners
  intervalSeconds: number // NEW: For vertical line time shifts
) {
  const firstPointRef = useRef<Point | null>(null);
  const secondPointRef = useRef<Point | null>(null);
  const tempLineRef = useRef<any | null>(null); // Any primitive
  const linesRef = useRef<any[]>([]);
  const selectedLineRef = useRef<any | null>(null);
  const draggingRef = useRef<{
    active: boolean;
    kind: string | null;
    lastLogical: number | null;
    lastPrice: number | null;
  }>({ active: false, kind: null, lastLogical: null, lastPrice: null });
  const infiniteLineRef = useRef<TrendLine | null>(null);
  const isDraggingDrawing = useRef(false);
  const { objectSelected, setTools } = SelectedTools();
  const { selectedSymbol } = useSelector();
  const [selectionTick, setSelectionTick] = React.useState(0);

  // persist drawings per symbol
  function getStorageKey() {
    const sym = selectedSymbol?.symbol ?? "__global__";
    return `drawings:${sym}`;
  }

  function saveDrawings() {
    try {
      const payload = linesRef.current.map((l) => {
        const anyL = l as any;
        // normalize kind to a canonical key
        const rawKind = String(anyL._kind ?? "").trim();
        const k = rawKind.toLowerCase();
        let kind = "unknown";
        if (k.includes("trend") || k === "trend") kind = "trend";
        else if (k.includes("position") || k === "position") kind = "position";
        else if (k.includes("horizontal")) kind = "horizontal";
        else if (k.includes("vertical")) kind = "vertical";
        else if (k.includes("ray")) kind = "ray";
        else if (k.includes("info")) kind = "info";
        else if (k.includes("extended")) kind = "extended";

        const base = {
          kind,
          options: anyL._options || anyL.getOptions?.(),
        };

        if (kind === "horizontal") {
          return { ...base, price: anyL._price };
        }
        if (kind === "vertical") {
          return { ...base, time: anyL._time };
        }
        if (kind === "position") {
          // PositionTool stores entry/tp/sl under different internal names
          const entry = anyL._entry ?? anyL._p1 ?? null;
          const tp = anyL._tp ?? anyL._p2 ?? null;
          const sl = anyL._sl ?? null;
          return { ...base, entry, tp, sl };
        }
        // trend/ray/info/extended -> p1/p2
        return {
          ...base,
          p1: anyL._p1 ?? anyL._entry ?? null,
          p2: anyL._p2 ?? anyL._tp ?? null,
        };
      });
      window.localStorage.setItem(getStorageKey(), JSON.stringify(payload));
    } catch (err) {
      console.error("Failed to save drawings", err);
    }
  }

  /* ---------- 5. loadDrawings – recreate horizontal/vertical lines ---------- */
  function loadDrawings() {
    try {
      const raw = window.localStorage.getItem(getStorageKey());
      if (!raw) return;
      const arr = JSON.parse(raw) as Array<any>;
      if (!Array.isArray(arr)) return;
      if (!chartRef.current || !candlestickSeriesRef.current) return;

      for (const d of arr) {
        let tool: any;
        // normalize incoming kind to canonical
        const incoming = String(d.kind ?? "").toLowerCase();
        const kind = incoming.includes("trend")
          ? "trend"
          : incoming.includes("position")
          ? "position"
          : incoming.includes("horizontal")
          ? "horizontal"
          : incoming.includes("vertical")
          ? "vertical"
          : incoming.includes("ray")
          ? "ray"
          : incoming.includes("info")
          ? "info"
          : incoming.includes("extended")
          ? "extended"
          : "unknown";

        if (
          kind === "trend" ||
          kind === "ray" ||
          kind === "info" ||
          kind === "extended"
        ) {
          tool = new TrendLine(
            chartRef.current,
            candlestickSeriesRef.current as any,
            d.p1,
            d.p2,
            d.options
          );
          (tool as any)._kind = kind === "trend" ? "trend" : kind;
        } else if (kind === "horizontal") {
          const hLine = drawDynamicHorizontalLine(d.price);
          if (hLine) {
            (hLine as any)._kind = "horizontal";
            (hLine as any)._price = d.price;
            tool = hLine;
          }
        } else if (kind === "vertical") {
          const vPoint = { time: d.time as UTCTimestamp, price: 0 };
          const vLine = drawVerticalLine(vPoint);
          if (vLine) {
            (vLine as any)._kind = "vertical";
            (vLine as any)._time = d.time;
            tool = vLine;
          }
        } else if (kind === "position") {
          // recreate PositionTool: payload may have entry/tp/sl or p1/p2
          const entry = d.entry ?? d.p1 ?? null;
          const tp = d.tp ?? d.p2 ?? null;
          const sl = d.sl ?? null;
          if (entry && tp != null && sl != null) {
            try {
              const opts = { ...(d.options ?? {}) } as any;
              // legacy support: sometimes width/bandWidth stored top-level
              if (typeof d.bandWidth === "number") opts.bandWidth = d.bandWidth;
              if (typeof d.width === "number") opts.bandWidth = d.width;
              tool = new PositionTool(
                chartRef.current,
                candlestickSeriesRef.current as any,
                entry,
                tp,
                sl,
                opts
              );
              (tool as any)._kind = "position";
            } catch (err) {
              console.warn("failed to recreate position tool", err);
            }
          }
        } else {
          console.warn(`Unknown drawing kind: ${d.kind}`);
        }

        if (tool) {
          chartRef.current.panes()[0].attachPrimitive(tool);
          linesRef.current.push(tool);
        }
      }
    } catch (err) {
      console.error("Failed to load drawings", err);
    }
  }

  // when entering drawing mode for lines, ensure right whitespace exists
  React.useEffect(() => {
    if (!chartRef.current) return;
    const ts = chartRef.current.timeScale();
    const wantsWhitespace = [
      "Trend Line",
      "Ray",
      "Extended Line",
      "Info Line",
      "Trend Angle",
      "Vertical Line",
      "Horizontal Line",
    ].includes(objectSelected.title ?? "");
    if (objectSelected.isSelected && wantsWhitespace) {
      const currentRightOffset = (ts.options() as any)?.rightOffset ?? 2;
      if (currentRightOffset < 50) {
        ts.applyOptions({ rightOffset: 100, fixRightEdge: false });
      }
    }
  }, [objectSelected, chartRef]);

  // load on mount or when symbol changes
  React.useEffect(() => {
    if (chartRef.current) {
      for (const l of linesRef.current) {
        try {
          chartRef.current.panes()[0].detachPrimitive(l);
        } catch {}
      }
    }
    linesRef.current = [];
    selectedLineRef.current = null;
    loadDrawings();
    setSelectionTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol?.symbol]);

  // Add mouse event listeners for proper dragging
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !chartRef.current) return;

    const handleMouseDown = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      linesRef.current.forEach((l) => l.updateAllViews?.());

      // Determine hit candidate. We will select on first click, but only start dragging
      // if the candidate was already selected prior to this mousedown. This avoids
      // accidental drag-start when selecting a primitive for the first time.
      let selCandidate: any = null;
      let rawHit: any = false;

      // find topmost hit primitive
      for (let i = linesRef.current.length - 1; i >= 0; i--) {
        const cand = linesRef.current[i];
        const h = cand.isHit
          ? cand.isHit(px, py)
          : cand.isHitKind
          ? cand.isHitKind(px, py)
          : cand.hitTest
          ? cand.hitTest(px, py)
          : false;
        if (h) {
          selCandidate = cand;
          rawHit = h;
          break;
        }
      }

      // If candidate exists but is not yet selected, select it but DO NOT start drag.
      let sel = selectedLineRef.current;
      if (selCandidate) {
        if (selCandidate !== sel) {
          selectedLineRef.current = selCandidate;
          setSelectionTick((t) => t + 1);
          // selected now, but do not start dragging on this initial mousedown
          return;
        } else {
          // candidate is already selected -> allow continuing to drag
          sel = selCandidate;
        }
      } else {
        // no candidate; nothing to do
        return;
      }

      let kindHit: any = false;
      if (rawHit === "p1" || rawHit === "p2") kindHit = rawHit;
      else if (rawHit === "tp" || rawHit === "sl") kindHit = rawHit;
      else if (rawHit === "entry") kindHit = "entry";
      else if (rawHit === "resize") kindHit = "resize";
      else if (typeof rawHit === "string") kindHit = rawHit;
      else if (rawHit === true) kindHit = "body";

      if (kindHit && sel) {
        isDraggingDrawing.current = true;
        draggingRef.current = {
          active: true,
          kind: kindHit,
          lastLogical: null,
          lastPrice: null,
        };

        // ONLY disable user panning/zooming – keep coordinate updates alive
        chartRef.current?.applyOptions({
          handleScroll: {
            mouseWheel: false,
            pressedMouseMove: false,
            horzTouchDrag: false,
          },
          handleScale: {
            axisPressedMouseMove: false,
            mouseWheel: false,
            pinch: false,
          },
        });
      }
    };

    const handleMouseUp = () => {
      if (draggingRef.current.active) {
        draggingRef.current.active = false;
        isDraggingDrawing.current = false;

        saveDrawings();

        // Re-enable full interactivity
        chartRef.current?.applyOptions({
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
          },
          handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true,
          },
        });
      }
    };

    container.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [containerRef, chartRef, selectionTick]); // Depend on selectionTick to refresh after select

  // allow external callers (Chart) to notify primitives about new bars/prices
  function notifyNewBar(bar: {
    open: number;
    high: number;
    low: number;
    close: number;
    time?: Time;
  }) {
    for (const l of linesRef.current) {
      try {
        if (l && typeof l.checkBar === "function") {
          l.checkBar(bar);
        }
      } catch (err) {
        // ignore per-primitive errors
      }
    }
  }

  // helpers expect non-null refs; cast to expected types but still guard before use
  const { drawLine } = UseTrendLineFn(
    chartRef as React.RefObject<IChartApi>,
    candlestickSeriesRef as React.RefObject<ISeriesApi<"Candlestick">>
  );
  const { drawRayLine } = RayLine(
    chartRef as React.RefObject<IChartApi>,
    candlestickSeriesRef as React.RefObject<ISeriesApi<"Candlestick">>
  );
  const { drawInfoLine } = InfoLine(
    chartRef as React.RefObject<IChartApi>,
    candlestickSeriesRef as React.RefObject<ISeriesApi<"Candlestick">>
  );
  const { drawExtendedLine } = ExtendedLine(
    chartRef as React.RefObject<IChartApi>,
    candlestickSeriesRef as React.RefObject<ISeriesApi<"Candlestick">>
  );
  const { drawTrendAngle } = TrendAngle(
    chartRef as React.RefObject<IChartApi>,
    candlestickSeriesRef as React.RefObject<ISeriesApi<"Candlestick">>
  );
  const { drawDynamicHorizontalLine } = HorizontalLine(
    chartRef as React.RefObject<IChartApi>,
    candlestickSeriesRef as React.RefObject<ISeriesApi<SeriesType>>,
    infiniteLineRef as any // <-- pass the ref
  );
  const { drawVerticalLine } = VerticalLine(
    chartRef as React.RefObject<IChartApi>,
    candlestickSeriesRef as React.RefObject<ISeriesApi<SeriesType>>
  );

  const handleChartClick = (param: MouseEventParams) => {
    if (!param || !param.point) return;
    const point = param.point;

    // If in drawing mode, handle drawing (unchanged)
    if (objectSelected.isSelected) {
      const tsClick = chartRef.current?.timeScale();
      let time = tsClick?.coordinateToTime(point.x) as UTCTimestamp | undefined;
      const logicalClick = tsClick?.coordinateToLogical(point.x);
      if (tsClick && logicalClick != null) {
        const vr = tsClick.getVisibleLogicalRange();
        if (vr && Number(logicalClick) > Number(vr.to)) {
          const delta = Number(logicalClick) - Number(vr.to);
          const currentRightOffset =
            (tsClick.options() as any)?.rightOffset ?? 2;
          tsClick.applyOptions({
            rightOffset: currentRightOffset + delta + 5,
            fixRightEdge: false,
          });
        }
      }
      const price = candlestickSeriesRef.current
        ? candlestickSeriesRef.current.coordinateToPrice(point.y)
        : undefined;

      if ((time != null || logicalClick != null) && price != null) {
        const ensuredTime =
          (time as UTCTimestamp | undefined) ??
          ((firstPointRef.current?.time ??
            (Math.floor(Date.now() / 1000) as UTCTimestamp)) as UTCTimestamp);
        const logical = chartRef.current
          ?.timeScale()
          .coordinateToLogical(point.x);
        if (!firstPointRef.current) {
          firstPointRef.current = { time: ensuredTime, price } as any;
          if (logical != null) firstPointRef.current!.logical = logical;
          attachMouseMoveListener();
          if (objectSelected.title === "Horizontal Line") {
            const tl = drawDynamicHorizontalLine(price);
            if (tl) {
              // @ts-ignore
              tl._kind = "horizontal"; // NEW: For saving/loading and drag
              linesRef.current.push(tl);
              saveDrawings();
            }
          }
          const fp = firstPointRef.current;
          if (objectSelected.title === "Vertical Line" && fp) {
            const tl = drawVerticalLine({
              time: fp.time as UTCTimestamp,
              price: fp.price,
            });
            if (tl) {
              // @ts-ignore
              tl._kind = "vertical";
              linesRef.current.push(tl);
              saveDrawings();
            }
          }
        } else if (!secondPointRef.current) {
          secondPointRef.current = { time: ensuredTime, price } as any;
          if (logical != null) secondPointRef.current!.logical = logical;
          drawTrendLine();
          detachMouseMoveListener();
          setTools({ title: "trendLineTools", isSelected: false });
        }
      }
      return;
    }

    // Not drawing: select/deselect on click (no drag toggle)
    if (!chartRef.current) return;
    linesRef.current.forEach((l) => l.updateAllViews?.());
    let found = false;
    for (let i = linesRef.current.length - 1; i >= 0; i--) {
      const line = linesRef.current[i];
      const hit = line.isHit
        ? line.isHit(point.x, point.y)
        : line.isHitKind
        ? line.isHitKind(point.x, point.y)
        : line.hitTest
        ? line.hitTest(point.x, point.y)
        : null;
      if (hit) {
        selectedLineRef.current = line;
        setSelectionTick((t) => t + 1);
        found = true;
        break;
      }
    }
    if (!found) {
      selectedLineRef.current = null;
      setSelectionTick((t) => t + 1);
    }
  };

  const drawTrendLine = () => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    if (!firstPointRef.current || !secondPointRef.current) return;

    let tl: any;
    let kind: string = objectSelected.title ?? "trend";
    switch (objectSelected.title) {
      case "Trend Line":
        tl = new TrendLine(
          chartRef.current,
          candlestickSeriesRef.current,
          firstPointRef.current as any,
          secondPointRef.current as any,
          { showLabels: false }
        );
        break;
      case "Long Position":
      case "Short Position":
        const entry = firstPointRef.current as any;
        const second = secondPointRef.current as any;
        if (entry && second) {
          const isLong = objectSelected.title === "Long Position";
          const tp = isLong
            ? Math.max(second.price, entry.price + 1e-8)
            : Math.min(second.price, entry.price - 1e-8);
          const sl = isLong
            ? entry.price - Math.abs(tp - entry.price) / 2
            : entry.price + Math.abs(tp - entry.price) / 2;
          tl = new PositionTool(
            chartRef.current,
            candlestickSeriesRef.current as any,
            entry,
            tp,
            sl,
            { side: isLong ? "long" : "short" }
          );
          kind = "position";
        }
        break;
      case "Ray":
        tl = drawRayLine(
          firstPointRef.current as any,
          secondPointRef.current as any,
          { showLabels: false }
        );
        kind = "ray";
        break;
      case "Info Line":
        tl = drawInfoLine(
          firstPointRef.current as any,
          secondPointRef.current as any,
          { showLabels: true }
        );
        kind = "info";
        break;
      case "Extended Line":
        tl = drawExtendedLine(
          firstPointRef.current as any,
          secondPointRef.current as any,
          { showLabels: false }
        );
        kind = "extended";
        break;
      case "Trend Angle":
        drawTrendAngle(
          firstPointRef.current as any,
          secondPointRef.current as any
        );
        // Note: Not pushing to linesRef; add if you want persistence
        return;
    }
    if (tl) {
      // @ts-ignore
      tl._kind = kind;
      chartRef.current.panes()[0].attachPrimitive(tl);
      linesRef.current.push(tl);
      saveDrawings();
    }

    if (tempLineRef.current) {
      chartRef.current.panes()[0].detachPrimitive(tempLineRef.current);
      tempLineRef.current = null;
    }

    firstPointRef.current = null;
    secondPointRef.current = null;
  };

  const handleMouseMove = (param: MouseEventParams) => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;
    if (!param.point) return;

    const ts = chartRef.current.timeScale();
    const logical = ts.coordinateToLogical(param.point.x);
    const price = candlestickSeriesRef.current.coordinateToPrice(param.point.y);

    if (logical == null || price == null) return;

    // Extend whitespace if needed (unchanged)
    const visible = ts.getVisibleLogicalRange();
    if (visible && logical > visible.to) {
      const extra = logical - visible.to;
      const currentOffset = (ts.options() as any)?.rightOffset ?? 0;
      ts.applyOptions({
        rightOffset: currentOffset + extra + 5,
        fixRightEdge: false,
      });
    }

    // Dragging
    if (draggingRef.current.active && selectedLineRef.current) {
      const sel: any = selectedLineRef.current;
      const lastL = draggingRef.current.lastLogical ?? logical;
      const lastP = draggingRef.current.lastPrice ?? price;
      const dL = Number(logical) - Number(lastL);
      const dP = price - lastP;
      draggingRef.current.lastLogical = Number(logical);
      draggingRef.current.lastPrice = price;

      if (draggingRef.current.kind === "body" && sel.moveBy) {
        sel.moveBy(dL, dP);
      } else if (draggingRef.current.kind === "p1" && sel.setP1) {
        // move endpoint p1
        const newP1: any = { price: price };
        const ts = chartRef.current?.timeScale();
        const time = ts?.coordinateToTime((param as any).point.x);
        if (time != null) newP1.time = time;
        if (logical != null) newP1.logical = logical;
        sel.setP1(newP1);
      } else if (draggingRef.current.kind === "p2" && sel.setP2) {
        // move endpoint p2
        const newP2: any = { price: price };
        const ts = chartRef.current?.timeScale();
        const time = ts?.coordinateToTime((param as any).point.x);
        if (time != null) newP2.time = time;
        if (logical != null) newP2.logical = logical;
        sel.setP2(newP2);
      } else if (draggingRef.current.kind === "tp" && sel.setTp) {
        sel.setTp(price);
      } else if (draggingRef.current.kind === "sl" && sel.setSl) {
        sel.setSl(price);
      } else if (draggingRef.current.kind === "entry" && sel.setEntry) {
        const newEntry: any = { price };
        const ts2 = chartRef.current?.timeScale();
        const time2 = ts2?.coordinateToTime((param as any).point.x);
        if (time2 != null) newEntry.time = time2;
        if (logical != null) newEntry.logical = logical;
        sel.setEntry(newEntry);
      } else if (draggingRef.current.kind === "resize" && sel.setBandWidth) {
        // compute new bandWidth based on current crosshair x relative to entryX
        let entryX: number | null = null;
        try {
          const pv = sel._paneViews && sel._paneViews[0];
          entryX = pv?._coords?.entryX ?? null;
        } catch {}
        if (entryX == null && sel._entry) {
          const ts3 = chartRef.current?.timeScale();
          const coord =
            typeof sel._entry.logical === "number"
              ? ts3?.logicalToCoordinate(sel._entry.logical as any)
              : ts3?.timeToCoordinate(sel._entry.time as any);
          entryX = coord ?? null;
        }
        if (entryX != null) {
          const newBW = (param as any).point.x - entryX;
          sel.setBandWidth(newBW);
        }
      } else if (sel._kind === "horizontal") {
        if (sel.move) sel.move(dP); // Or sel._price += dP; sel.requestUpdate()
      } else if (sel._kind === "vertical") {
        const dt = dL * intervalSeconds;
        if (sel.move) sel.move(dt); // Or sel._time += dt; sel.requestUpdate()
      } else if (sel._p1 && sel._p2) {
        // Standard trendline shift
        if (typeof sel._p1.logical === "number") sel._p1.logical += dL;
        if (typeof sel._p2.logical === "number") sel._p2.logical += dL;
        sel._p1.price += dP;
        sel._p2.price += dP;
        sel.updateAllViews?.();
      }
      setSelectionTick((t) => t + 1);
    }

    // Temp line for drawing (unchanged)
    if (!firstPointRef.current) return;
    if (tempLineRef.current) {
      chartRef.current.panes()[0].detachPrimitive(tempLineRef.current);
    }
    const secondPoint: any = { logical, price };
    tempLineRef.current = new TrendLine(
      chartRef.current,
      candlestickSeriesRef.current,
      firstPointRef.current as Point,
      secondPoint,
      { showLabels: false }
    );
    chartRef.current.panes()[0].attachPrimitive(tempLineRef.current);
  };

  const attachMouseMoveListener = () => {
    if (!chartRef.current) return;
    chartRef.current.subscribeCrosshairMove(handleMouseMove);
  };

  const detachMouseMoveListener = () => {
    if (!chartRef.current) return;
    chartRef.current.unsubscribeCrosshairMove(handleMouseMove);
  };

  const updateSelectedLineStyle = (opts: {
    color?: string;
    width?: number;
  }) => {
    if (!selectedLineRef.current?.updateOptions) return;
    selectedLineRef.current.updateOptions({
      lineColor: opts.color ?? selectedLineRef.current.getOptions().lineColor,
      width: opts.width ?? selectedLineRef.current.getOptions().width,
    });
    saveDrawings();
  };

  const deleteSelectedLine = () => {
    if (!chartRef.current || !selectedLineRef.current) return;
    chartRef.current.panes()[0].detachPrimitive(selectedLineRef.current);
    const idx = linesRef.current.indexOf(selectedLineRef.current);
    if (idx >= 0) linesRef.current.splice(idx, 1);
    selectedLineRef.current = null;
    saveDrawings();
    setSelectionTick((t) => t + 1);
  };

  const getSelectedLineMidpoint = (): { x: number; y: number } | null => {
    const line = selectedLineRef.current;
    const chart = chartRef.current;

    if (!line || !chart) return null;

    const p1 =
      (line as any).p1 ??
      (line as any).point1 ??
      (line as any).startPoint ??
      (line as any)._p1;
    const p2 =
      (line as any).p2 ??
      (line as any).point2 ??
      (line as any).endPoint ??
      (line as any)._p2;
    if (!p1 || !p2) return null;

    const ts = chart.timeScale();
    const series = candlestickSeriesRef.current;
    if (!ts || !series) return null;

    const x1 =
      p1.logical != null
        ? ts.logicalToCoordinate(p1.logical)
        : ts.timeToCoordinate(p1.time);
    const x2 =
      p2.logical != null
        ? ts.logicalToCoordinate(p2.logical)
        : ts.timeToCoordinate(p2.time);
    const y1 = series.priceToCoordinate(p1.price);
    const y2 = series.priceToCoordinate(p2.price);

    if (x1 == null || x2 == null || y1 == null || y2 == null) return null;

    return {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
    };
  };

  return {
    handleChartClick,
    drawTrendLine,
    updateSelectedLineStyle,
    deleteSelectedLine,
    getSelectedLineMidpoint,
    selectedLineRef,
    selectionTick,
    saveDrawings,
    bumpSelectionTick: () => setSelectionTick((t) => t + 1),
    loadDrawings,
    notifyNewBar,
  };
}
