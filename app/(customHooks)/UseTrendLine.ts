import React, { useRef, useEffect, useState } from "react";
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
import HorizontalLine from "./HorizontalLine";
import VerticalLine from "./VerticalLine";
import { PositionTool } from "../(plugins)/TrendPosition";
import { useSelector } from "../(store)/SelectedSymbol";

interface Point {
  time: Time;
  price: number;
  logical?: Logical;
}

interface DragState {
  active: boolean;
  kind: string | null;
  lastLogical: number | null;
  lastPrice: number | null;
}

interface DrawingData {
  kind: string;
  options?: any;
  price?: number;
  time?: Time;
  entry?: any;
  tp?: number;
  sl?: number;
  p1?: any;
  p2?: any;
}

// ============================================================================
// STORAGE MANAGER
// ============================================================================

class DrawingsStorage {
  constructor(private getSymbol: () => string) {}

  private getStorageKey(): string {
    return `drawings:${this.getSymbol() || "__global__"}`;
  }

  save(drawings: any[]) {
    try {
      const payload = drawings.map((drawing) => this.serializeDrawing(drawing));
      localStorage.setItem(this.getStorageKey(), JSON.stringify(payload));
    } catch (err) {
      console.error("Failed to save drawings:", err);
    }
  }

  load(): DrawingData[] {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (!raw) return [];

      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("Failed to load drawings:", err);
      return [];
    }
  }

  public serializeDrawing(drawing: any): DrawingData {
    const kind = this.normalizeKind(drawing._kind);
    const options = this.extractSafeOptions(drawing);

    const base: DrawingData = { kind, options };

    switch (kind) {
      case "horizontal":
        return { ...base, price: drawing._price };
      case "vertical":
        return { ...base, time: drawing._time };
      case "position":
        return {
          ...base,
          entry: drawing._entry,
          tp: drawing._tp,
          sl: drawing._sl,
        };
      default:
        return { ...base, p1: drawing._p1, p2: drawing._p2 };
    }
  }

  public normalizeKind(rawKind: string): string {
    const k = String(rawKind || "")
      .trim()
      .toLowerCase();

    const kindMap: Record<string, string> = {
      trend: "trend",
      position: "position",
      horizontal: "horizontal",
      vertical: "vertical",
      ray: "ray",
      info: "info",
      extended: "extended",
    };

    for (const [key, value] of Object.entries(kindMap)) {
      if (k.includes(key)) return value;
    }

    return "unknown";
  }

  private extractSafeOptions(drawing: any): any {
    const opts = drawing.getOptions?.() || drawing._options || {};

    return {
      side: opts.side,
      entryColor: opts.entryColor,
      tpColor: opts.tpColor,
      slColor: opts.slColor,
      lineColor: opts.lineColor,
      width: opts.width,
      bandBars: opts.bandBars,
    };
  }
}

// ============================================================================
// DRAWING FACTORY
// ============================================================================

class DrawingFactory {
  constructor(
    private chart: IChartApi,
    private series: ISeriesApi<"Candlestick">,
    private drawHelpers: any
  ) {}

  create(data: DrawingData): any | null {
    const kind = this.normalizeIncomingKind(data.kind);

    switch (kind) {
      case "trend":
      case "ray":
      case "info":
      case "extended":
        return this.createLineDrawing(kind, data);
      case "horizontal":
        return this.createHorizontalLine(data);
      case "vertical":
        return this.createVerticalLine(data);
      case "position":
        return this.createPositionTool(data);
      default:
        console.warn(`Unknown drawing kind: ${data.kind}`);
        return null;
    }
  }

  private normalizeIncomingKind(kind: string): string {
    const k = String(kind || "").toLowerCase();

    if (k.includes("trend")) return "trend";
    if (k.includes("position")) return "position";
    if (k.includes("horizontal")) return "horizontal";
    if (k.includes("vertical")) return "vertical";
    if (k.includes("ray")) return "ray";
    if (k.includes("info")) return "info";
    if (k.includes("extended")) return "extended";

    return "unknown";
  }

  private createLineDrawing(kind: string, data: DrawingData): any | null {
    if (!data.p1 || !data.p2) return null;

    const tool = new TrendLine(
      this.chart,
      this.series,
      data.p1,
      data.p2,
      data.options
    );

    (tool as any)._kind = kind;
    return tool;
  }

  private createHorizontalLine(data: DrawingData): any | null {
    if (typeof data.price !== "number") return null;

    const hLine = this.drawHelpers.drawDynamicHorizontalLine(data.price);
    if (hLine) {
      (hLine as any)._kind = "horizontal";
      (hLine as any)._price = data.price;
    }
    return hLine;
  }

  private createVerticalLine(data: DrawingData): any | null {
    if (!data.time) return null;

    const vPoint = { time: data.time as UTCTimestamp, price: 0 };
    const vLine = this.drawHelpers.drawVerticalLine(vPoint);
    if (vLine) {
      (vLine as any)._kind = "vertical";
      (vLine as any)._time = data.time;
    }
    return vLine;
  }

  private createPositionTool(data: DrawingData): any | null {
    const entry = data.entry ?? data.p1;
    const tp = data.tp ?? data.p2;
    const sl = data.sl;

    if (!entry || tp == null || sl == null) return null;

    try {
      const options = this.preparePositionOptions(data);
      const enrichedEntry = this.enrichEntry(entry);

      const tool = new PositionTool(
        this.chart,
        this.series,
        enrichedEntry,
        tp,
        sl,
        options
      );

      (tool as any)._kind = "position";

      // Initialize position tool
      this.initializePositionTool(tool, enrichedEntry);

      return tool;
    } catch (err) {
      console.warn("Failed to create position tool:", err);
      return null;
    }
  }

  private preparePositionOptions(data: DrawingData): any {
    const opts = { ...(data.options || {}) };

    // Ensure bandBars is set (for resize functionality)
    if (typeof opts.bandBars !== "number") {
      opts.bandBars = data.options?.bandBars ?? 30;
    }

    return opts;
  }

  private enrichEntry(entry: any): any {
    const enriched = { ...entry };

    // Try to calculate logical from time if missing
    if (typeof enriched.logical !== "number" && enriched.time != null) {
      try {
        const ts = this.chart.timeScale();
        const coord = ts.timeToCoordinate(this.normalizeTime(enriched.time));

        if (coord != null) {
          const logical = ts.coordinateToLogical(coord as any);
          if (typeof logical === "number") {
            enriched.logical = logical;
          }
        }
      } catch {
        // Keep entry as-is
      }
    }

    return enriched;
  }

  private normalizeTime(time: any): Time {
    if (typeof time === "number") {
      if (time > 1e12) {
        return Math.floor(time / 1000) as UTCTimestamp;
      }
      return Math.floor(time) as UTCTimestamp;
    }
    return time;
  }

  private initializePositionTool(tool: any, entry: any) {
    // Update views immediately
    tool.updateAllViews?.();

    // Ensure logical coordinate is set (critical for resize)
    const ensureLogical = () => {
      if (
        tool._entry &&
        typeof tool._entry.logical !== "number" &&
        tool._entry.time != null
      ) {
        try {
          const ts = this.chart.timeScale();
          const coord = ts.timeToCoordinate(tool._entry.time as any);

          if (coord != null) {
            const logical = ts.coordinateToLogical(coord as any);
            if (typeof logical === "number") {
              tool._entry.logical = logical;
              tool.updateAllViews?.();
              return true;
            }
          }
        } catch {
          // Ignore
        }
      }
      return false;
    };

    // Try multiple times with delays
    if (!ensureLogical()) {
      setTimeout(() => {
        if (!ensureLogical()) {
          setTimeout(() => ensureLogical(), 500);
        }
      }, 200);
    }

    // Check historical bars
    setTimeout(() => {
      tool.updateAllViews?.();
      tool.checkAllHistoricalBars?.();
    }, 200);
  }
}

// ============================================================================
// DRAG MANAGER
// ============================================================================

class DragManager {
  private dragState: DragState = {
    active: false,
    kind: null,
    lastLogical: null,
    lastPrice: null,
  };

  constructor(
    private chart: IChartApi,
    private series: ISeriesApi<"Candlestick">,
    private intervalSeconds: number
  ) {}

  startDrag(kind: string) {
    this.dragState = {
      active: true,
      kind,
      lastLogical: null,
      lastPrice: null,
    };

    this.disableChartInteraction();
  }

  stopDrag() {
    this.dragState.active = false;
    this.enableChartInteraction();
  }

  isActive(): boolean {
    return this.dragState.active;
  }

  handleDrag(
    selected: any,
    param: MouseEventParams,
    logical: number,
    price: number
  ) {
    if (!this.dragState.active || !selected) return;

    const lastL = this.dragState.lastLogical ?? logical;
    const lastP = this.dragState.lastPrice ?? price;
    const deltaL = Number(logical) - Number(lastL);
    const deltaP = price - lastP;

    this.dragState.lastLogical = Number(logical);
    this.dragState.lastPrice = price;

    this.applyDragAction(selected, param, logical, price, deltaL, deltaP);
  }

  private applyDragAction(
    selected: any,
    param: MouseEventParams,
    logical: number,
    price: number,
    deltaL: number,
    deltaP: number
  ) {
    const kind = this.dragState.kind;

    switch (kind) {
      case "body":
        if (selected.moveBy) {
          selected.moveBy(deltaL, deltaP);
          selected.updateAllViews?.();
        }
        break;

      case "p1":
        this.moveEndpoint(selected, "setP1", param, logical, price);
        selected.updateAllViews?.();
        break;

      case "p2":
        this.moveEndpoint(selected, "setP2", param, logical, price);
        selected.updateAllViews?.();
        break;

      case "tp":
        if (selected.setTp) selected.setTp(price);
        selected.updateAllViews?.();
        break;

      case "sl":
        if (selected.setSl) selected.setSl(price);
        selected.updateAllViews?.();
        break;

      case "entry":
        this.moveEntry(selected, param, logical, price);
        selected.updateAllViews?.();
        break;

      case "resize":
        this.handleResize(selected, param);
        break;

      default:
        selected.updateAllViews?.();
        this.handleKindSpecificDrag(selected, deltaL, deltaP);
    }
  }

  private moveEndpoint(
    selected: any,
    setterName: string,
    param: MouseEventParams,
    logical: number,
    price: number
  ) {
    if (!selected[setterName]) return;

    const newPoint: any = { price };
    const time = this.chart.timeScale().coordinateToTime(param.point!.x);

    if (time != null) newPoint.time = time;
    if (logical != null) newPoint.logical = logical;

    selected[setterName](newPoint);
  }

  private moveEntry(
    selected: any,
    param: MouseEventParams,
    logical: number,
    price: number
  ) {
    if (!selected.setEntry) return;

    const newEntry: any = { price };
    const time = this.chart.timeScale().coordinateToTime(param.point!.x);

    if (time != null) newEntry.time = time;
    if (logical != null) newEntry.logical = logical;

    selected.setEntry(newEntry);
  }

  private handleResize(selected: any, param: MouseEventParams) {
    if (!selected.setBandWidth) return;

    let entryX: number | null = null;

    try {
      // Force view update
      selected.updateAllViews?.();

      // Get entry X coordinate
      const pv = selected._paneViews?.[0];
      entryX = pv?._coords?.entryX ?? null;

      // Try direct calculation if needed
      if (entryX == null && selected._entry) {
        entryX = this.calculateEntryX(selected._entry);
      }
    } catch (err) {
      console.warn("Error calculating entryX for resize:", err);
    }

    if (entryX != null) {
      const newBandWidth = Math.max(10, param.point!.x - entryX);
      selected.setBandWidth(newBandWidth);
    } else {
      console.warn("Cannot resize: entryX is null");
    }
  }

  private calculateEntryX(entry: any): number | null {
    const ts = this.chart.timeScale();

    // Try logical first
    if (typeof entry.logical === "number") {
      const coord = ts.logicalToCoordinate(entry.logical as any);
      if (coord != null && typeof coord === "number") return coord;
    }

    // Try time
    if (entry.time != null) {
      const coord = ts.timeToCoordinate(entry.time as any);
      if (coord != null && typeof coord === "number") return coord;
    }

    return null;
  }

  private handleKindSpecificDrag(
    selected: any,
    deltaL: number,
    deltaP: number
  ) {
    if (selected._kind === "horizontal") {
      if (selected.move) selected.move(deltaP);
    } else if (selected._kind === "vertical") {
      const deltaTime = deltaL * this.intervalSeconds;
      if (selected.move) selected.move(deltaTime);
    } else if (selected._p1 && selected._p2) {
      // Standard trendline shift
      if (typeof selected._p1.logical === "number") {
        selected._p1.logical += deltaL;
      }
      if (typeof selected._p2.logical === "number") {
        selected._p2.logical += deltaL;
      }
      selected._p1.price += deltaP;
      selected._p2.price += deltaP;
      selected.updateAllViews?.();
    }
  }

  private disableChartInteraction() {
    this.chart.applyOptions({
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

  private enableChartInteraction() {
    this.chart.applyOptions({
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
}

// ============================================================================
// SELECTION MANAGER
// ============================================================================

class SelectionManager {
  private selectedLine: any = null;
  private listeners: Array<() => void> = [];

  getSelected(): any {
    return this.selectedLine;
  }

  setSelected(line: any) {
    this.selectedLine = line;
    this.notifyListeners();
  }

  clear() {
    this.selectedLine = null;
    this.notifyListeners();
  }

  onChange(callback: () => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => cb());
  }

  findHit(
    lines: any[],
    px: number,
    py: number
  ): { line: any; hit: any } | null {
    // Update all views before hit testing
    lines.forEach((l) => l.updateAllViews?.());

    // Find topmost hit (iterate in reverse)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const hit =
        line.isHit?.(px, py) ??
        line.isHitKind?.(px, py) ??
        line.hitTest?.(px, py) ??
        false;

      if (hit) {
        return { line, hit };
      }
    }

    return null;
  }
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export default function useTrendLine(
  chartRef: React.RefObject<IChartApi | null>,
  candlestickSeriesRef: React.RefObject<ISeriesApi<"Candlestick"> | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  intervalSeconds: number
) {
  const firstPointRef = useRef<Point | null>(null);
  const secondPointRef = useRef<Point | null>(null);
  const tempLineRef = useRef<any | null>(null);
  const linesRef = useRef<any[]>([]);
  const isDraggingDrawing = useRef(false);
  const infiniteLineRef = useRef<any | null>(null);

  const { objectSelected, setTools } = SelectedTools();
  const { selectedSymbol } = useSelector();
  const [selectionTick, setSelectionTick] = useState(0);

  // Managers
  const storageRef = useRef<DrawingsStorage | null>(null);
  const factoryRef = useRef<DrawingFactory | null>(null);
  const dragManagerRef = useRef<DragManager | null>(null);
  const selectionManagerRef = useRef<SelectionManager>(new SelectionManager());

  // Initialize managers
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    storageRef.current = new DrawingsStorage(
      () => selectedSymbol?.symbol ?? "__global__"
    );

    const drawHelpers = initializeDrawHelpers();
    factoryRef.current = new DrawingFactory(
      chartRef.current,
      candlestickSeriesRef.current,
      drawHelpers
    );

    dragManagerRef.current = new DragManager(
      chartRef.current,
      candlestickSeriesRef.current,
      intervalSeconds
    );
    
    loadDrawings();

    // Subscribe to selection changes
    return selectionManagerRef.current.onChange(() => {
      setSelectionTick((t) => t + 1);
    });
  }, [chartRef, candlestickSeriesRef, intervalSeconds, selectedSymbol]);

  // Initialize draw helpers
  function initializeDrawHelpers() {
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
      infiniteLineRef
    );
    const { drawVerticalLine } = VerticalLine(
      chartRef as React.RefObject<IChartApi>,
      candlestickSeriesRef as React.RefObject<ISeriesApi<SeriesType>>
    );

    return {
      drawLine,
      drawRayLine,
      drawInfoLine,
      drawExtendedLine,
      drawTrendAngle,
      drawDynamicHorizontalLine,
      drawVerticalLine,
    };
  }

  // Save/Load drawings
  const saveDrawings = () => {
    storageRef.current?.save(linesRef.current);
  };

  const loadDrawings = () => {
    if (
      !chartRef.current ||
      !candlestickSeriesRef.current ||
      !factoryRef.current
    ) {
      console.log(chartRef.current);
      console.log(candlestickSeriesRef.current)
      console.log(factoryRef.current);
      return;
    }

    // Clear existing drawings
    linesRef.current.forEach((line) => {
      try {
        chartRef.current?.panes()[0].detachPrimitive(line);
      } catch {
        // Ignore errors
      }
    });
    linesRef.current = [];

    // Load and create drawings
    const data = storageRef.current?.load() ?? [];

    data.forEach((drawingData) => {
      const tool = factoryRef.current?.create(drawingData);

      if (tool) {
        chartRef.current?.panes()[0].attachPrimitive(tool);
        linesRef.current.push(tool);
      }
    });

    selectionManagerRef.current.clear();
  };

  // Ensure whitespace when entering drawing mode
  useEffect(() => {
    if (!chartRef.current) return;

    const needsWhitespace = [
      "Trend Line",
      "Ray",
      "Extended Line",
      "Info Line",
      "Trend Angle",
      "Vertical Line",
      "Horizontal Line",
    ].includes(objectSelected.title ?? "");

    if (objectSelected.isSelected && needsWhitespace) {
      const ts = chartRef.current.timeScale();
      const currentOffset = (ts.options() as any)?.rightOffset ?? 2;

      if (currentOffset < 50) {
        ts.applyOptions({ rightOffset: 100, fixRightEdge: false });
      }
    }
  }, [objectSelected, chartRef]);

  // Mouse event handlers
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !chartRef.current) return;

    const handleMouseDown = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      const hitResult = selectionManagerRef.current.findHit(
        linesRef.current,
        px,
        py
      );

      if (!hitResult) return;

      const { line, hit } = hitResult;
      const currentSelection = selectionManagerRef.current.getSelected();

      // Select on first click, drag on second click
      if (line !== currentSelection) {
        selectionManagerRef.current.setSelected(line);
        return;
      }

      // Start dragging
      const hitKind = normalizeHitKind(hit);
      if (hitKind) {
        isDraggingDrawing.current = true;
        dragManagerRef.current?.startDrag(hitKind);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingDrawing.current) {
        isDraggingDrawing.current = false;
        dragManagerRef.current?.stopDrag();
        saveDrawings();
      }
    };

    container.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [containerRef, chartRef, selectionTick]);

  function normalizeHitKind(hit: any): string | null {
    if (hit === "p1" || hit === "p2") return hit;
    if (hit === "tp" || hit === "sl") return hit;
    if (hit === "entry") return "entry";
    if (hit === "resize") return "resize";
    if (typeof hit === "string") return hit;
    if (hit === true) return "body";
    return null;
  }

  // Handle chart clicks
  const handleChartClick = (param: MouseEventParams) => {
    if (!param?.point) return;

    if (objectSelected.isSelected) {
      handleDrawingClick(param);
    } else {
      handleSelectionClick(param);
    }
  };

  const handleDrawingClick = (param: MouseEventParams) => {
    const ts = chartRef.current?.timeScale();
    if (!ts) return;

    const logical = ts.coordinateToLogical(param.point!.x);
    const price = candlestickSeriesRef.current?.coordinateToPrice(
      param.point!.y
    );

    if (
      (logical == null && !ts.coordinateToTime(param.point!.x)) ||
      price == null
    ) {
      return;
    }

    // Extend visible range if needed
    const visibleRange = ts.getVisibleLogicalRange();
    if (visibleRange && logical != null && logical > visibleRange.to) {
      const delta = logical - visibleRange.to;
      const currentOffset = (ts.options() as any)?.rightOffset ?? 2;
      ts.applyOptions({
        rightOffset: currentOffset + delta + 5,
        fixRightEdge: false,
      });
    }

    const time =
      ts.coordinateToTime(param.point!.x) ??
      (Math.floor(Date.now() / 1000) as UTCTimestamp);

    const point: Point = { time, price };
    if (logical != null) point.logical = logical;

    if (!firstPointRef.current) {
      firstPointRef.current = point;
      attachMouseMoveListener();
      handleSingleClickDrawing(point);
    } else if (!secondPointRef.current) {
      secondPointRef.current = point;
      drawTrendLine();
      detachMouseMoveListener();
      setTools({ title: "trendLineTools", isSelected: false });
    }
  };

  const handleSingleClickDrawing = (point: Point) => {
    if (objectSelected.title === "Horizontal Line") {
      const drawHelpers = initializeDrawHelpers();
      const tl = drawHelpers.drawDynamicHorizontalLine(point.price);
      if (tl) {
        (tl as any)._kind = "horizontal";
        (tl as any)._price = point.price;
        linesRef.current.push(tl);
        saveDrawings();
      }
    } else if (objectSelected.title === "Vertical Line") {
      const drawHelpers = initializeDrawHelpers();
      const tl = drawHelpers.drawVerticalLine({
        time: point.time as UTCTimestamp,
        price: point.price,
      });
      if (tl) {
        (tl as any)._kind = "vertical";
        (tl as any)._time = point.time;
        linesRef.current.push(tl);
        saveDrawings();
      }
    }
  };

  const handleSelectionClick = (param: MouseEventParams) => {
    if (!chartRef.current) return;

    const hitResult = selectionManagerRef.current.findHit(
      linesRef.current,
      param.point!.x,
      param.point!.y
    );

    if (hitResult) {
      selectionManagerRef.current.setSelected(hitResult.line);
    } else {
      selectionManagerRef.current.clear();
    }
  };

  // Draw trend line
  const drawTrendLine = () => {
    if (
      !chartRef.current ||
      !candlestickSeriesRef.current ||
      !firstPointRef.current ||
      !secondPointRef.current
    ) {
      return;
    }

    const tool = createDrawingTool();

    if (tool) {
      chartRef.current.panes()[0].attachPrimitive(tool);
      linesRef.current.push(tool);
      saveDrawings();
    }

    // Clean up temp line
    if (tempLineRef.current) {
      chartRef.current.panes()[0].detachPrimitive(tempLineRef.current);
      tempLineRef.current = null;
    }

    firstPointRef.current = null;
    secondPointRef.current = null;
  };

  const createDrawingTool = (): any | null => {
    const p1:any = firstPointRef.current!;
    const p2:any = secondPointRef.current!;
    const title = objectSelected.title;
    const drawHelpers = initializeDrawHelpers();

    let tool: any = null;
    let kind = "trend";

    switch (title) {
      case "Trend Line":
        tool = new TrendLine(
          chartRef.current!,
          candlestickSeriesRef.current!,
          p1,
          p2,
          { showLabels: false }
        );
        kind = "trend";
        break;

      case "Long Position":
      case "Short Position":
        tool = createPositionFromPoints(p1, p2, title === "Long Position");
        kind = "position";
        break;

      case "Ray":
        tool = drawHelpers.drawRayLine(p1, p2, { showLabels: false });
        kind = "ray";
        break;

      case "Info Line":
        tool = drawHelpers.drawInfoLine(p1, p2, { showLabels: true });
        kind = "info";
        break;

      case "Extended Line":
        tool = drawHelpers.drawExtendedLine(p1, p2, { showLabels: false });
        kind = "extended";
        break;

      case "Trend Angle":
        drawHelpers.drawTrendAngle(p1, p2);
        return null; // Not persisted

      default:
        return null;
    }

    if (tool) {
      (tool as any)._kind = kind;
    }

    return tool;
  };

  const createPositionFromPoints = (
    p1: Point,
    p2: Point,
    isLong: boolean
  ): any => {
    const entry = p1;
    const tp = isLong
      ? Math.max(p2.price, entry.price + 1e-8)
      : Math.min(p2.price, entry.price - 1e-8);
    const sl = isLong
      ? entry.price - Math.abs(tp - entry.price) / 2
      : entry.price + Math.abs(tp - entry.price) / 2;

    return new PositionTool(
      chartRef.current!,
      candlestickSeriesRef.current!,
      entry,
      tp,
      sl,
      { side: isLong ? "long" : "short" }
    );
  };

  // Handle mouse move for drawing
  const handleMouseMove = (param: MouseEventParams) => {
    if (!chartRef.current || !candlestickSeriesRef.current || !param.point) {
      return;
    }

    const ts = chartRef.current.timeScale();
    const logical = ts.coordinateToLogical(param.point.x);
    const price = candlestickSeriesRef.current.coordinateToPrice(param.point.y);

    if (logical == null || price == null) return;

    // Handle dragging
    if (dragManagerRef.current?.isActive()) {
      const selected = selectionManagerRef.current.getSelected();
      dragManagerRef.current.handleDrag(selected, param, logical, price);
      setSelectionTick((t) => t + 1);
      return;
    }

    // Extend whitespace if needed
    const visible = ts.getVisibleLogicalRange();
    if (visible && logical > visible.to) {
      const extra = logical - visible.to;
      const currentOffset = (ts.options() as any)?.rightOffset ?? 0;
      ts.applyOptions({
        rightOffset: currentOffset + extra + 5,
        fixRightEdge: false,
      });
    }

    // Draw temp line while drawing
    if (firstPointRef.current) {
      updateTempLine(logical, price);
    }
  };

  const updateTempLine = (logical: number, price: number) => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    if (tempLineRef.current) {
      chartRef.current.panes()[0].detachPrimitive(tempLineRef.current);
    }

    const secondPoint: Point = {
      logical: logical as Logical,
      price,
      time: firstPointRef.current!.time,
    };

    tempLineRef.current = new TrendLine(
      chartRef.current,
      candlestickSeriesRef.current,
      firstPointRef.current!,
      secondPoint,
      { showLabels: false }
    );

    chartRef.current.panes()[0].attachPrimitive(tempLineRef.current);
  };

  const attachMouseMoveListener = () => {
    chartRef.current?.subscribeCrosshairMove(handleMouseMove);
  };

  const detachMouseMoveListener = () => {
    chartRef.current?.unsubscribeCrosshairMove(handleMouseMove);
  };

  // Style updates
  const updateSelectedLineStyle = (opts: {
    color?: string;
    width?: number;
  }) => {
    const selected = selectionManagerRef.current.getSelected();
    if (!selected?.updateOptions) return;

    selected.updateOptions({
      lineColor: opts.color ?? selected.getOptions().lineColor,
      width: opts.width ?? selected.getOptions().width,
    });

    saveDrawings();
  };

  // Delete selected
  const deleteSelectedLine = () => {
    if (!chartRef.current) return;

    const selected = selectionManagerRef.current.getSelected();
    if (!selected) return;

    chartRef.current.panes()[0].detachPrimitive(selected);

    const idx = linesRef.current.indexOf(selected);
    if (idx >= 0) {
      linesRef.current.splice(idx, 1);
    }

    selectionManagerRef.current.clear();
    saveDrawings();
  };

  // Get midpoint
  const getSelectedLineMidpoint = (): { x: number; y: number } | null => {
    const line = selectionManagerRef.current.getSelected();
    if (!line || !chartRef.current) return null;

    const p1 = line.p1 ?? line._p1 ?? line.point1 ?? line.startPoint;
    const p2 = line.p2 ?? line._p2 ?? line.point2 ?? line.endPoint;

    if (!p1 || !p2) return null;

    const ts = chartRef.current.timeScale();
    const series = candlestickSeriesRef.current;
    if (!series) return null;

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

  // Notify primitives about new bars
  const notifyNewBar = (bar: {
    open: number;
    high: number;
    low: number;
    close: number;
    time?: Time;
  }) => {
    linesRef.current.forEach((line) => {
      try {
        line.checkBar?.(bar);
      } catch {
        // Ignore errors
      }
    });
  };

  return {
    handleChartClick,
    drawTrendLine,
    updateSelectedLineStyle,
    deleteSelectedLine,
    getSelectedLineMidpoint,
    selectedLineRef: {
      get current() {
        return selectionManagerRef.current.getSelected();
      },
      set current(value: any) {
        selectionManagerRef.current.setSelected(value);
      },
    },
    selectionTick,
    saveDrawings,
    bumpSelectionTick: () => setSelectionTick((t) => t + 1),
    loadDrawings,
    notifyNewBar,
  };
}
