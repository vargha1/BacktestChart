import {
  CanvasRenderingTarget2D,
  BitmapCoordinatesRenderingScope,
} from "fancy-canvas";
import {
  AutoscaleInfo,
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  SeriesOptionsMap,
  SeriesType,
  Time,
  Coordinate,
} from "lightweight-charts";

type Price = number;

export type PositionSide = "long" | "short";

export interface PositionOptions {
  side: PositionSide;
  entryColor: string;
  tpColor: string;
  slColor: string;
  lineColor: string;
  width: number;
  // horizontal band width in coordinate units (pixels on chart coordinate space)
  bandWidth?: number;
}

const defaultOptions: PositionOptions = {
  side: "long",
  entryColor: "#8888ff55",
  tpColor: "#2ecc7055",
  slColor: "#e74c3c55",
  lineColor: "#ffffff",
  width: 2,
  bandWidth: 120,
};

export interface PositionPoint {
  time?: Time;
  logical?: number;
  price: Price;
}

class PositionPaneRenderer implements IPrimitivePaneRenderer {
  _view: PositionPaneView;
  constructor(view: PositionPaneView) {
    this._view = view;
  }
  draw(target: CanvasRenderingTarget2D) {
    const v = this._view;
    const { entryX, entryY, tpY, slY } = v._coords;
    if (entryX == null || entryY == null || tpY == null || slY == null) return;
    target.useBitmapCoordinateSpace(
      (scope: BitmapCoordinatesRenderingScope) => {
        const ctx = scope.context;
        const x = Math.round(entryX * scope.horizontalPixelRatio);
        const yEntry = Math.round(entryY * scope.verticalPixelRatio);
        const yTp = Math.round(tpY * scope.verticalPixelRatio);
        const ySl = Math.round(slY * scope.verticalPixelRatio);

        // Determine horizontal extent: from entryX to either hitTime coordinate or right edge
        const src = v._source as any;
        const ts = src._chart.timeScale();
        const visible = ts.getVisibleRange?.();
        const rightLogical = (ts as any).visibleLogicalRange?.()?.to ?? null;
        let rightX = Math.round(scope.bitmapSize.width); // default right edge

        // bandWidth in device pixels (used for fallback placement)
        const desiredBandDevice = Math.round(
          (v._options.bandWidth ?? 120) * scope.horizontalPixelRatio
        );

        // compute hit coordinate robustly from stored _hitTime (no more cached _hitCoord)
        const computeHitDeviceX = (): number | null => {
          // prefer a stored logical index (stable) if available
          if (typeof src._hitLogical === "number") {
            try {
              // Try the logical value directly
              const tryLg = (lg: number | null | undefined) => {
                try {
                  if (lg == null) return null;
                  const c = ts.logicalToCoordinate(lg as any);
                  return typeof c === "number" ? c : null;
                } catch {
                  return null;
                }
              };
              let c = tryLg(src._hitLogical);
              // try rounding/floor/ceil in case logical is fractional or off-by-one
              if (c == null) c = tryLg(Math.round(src._hitLogical as number));
              if (c == null) c = tryLg(Math.floor(src._hitLogical as number));
              if (c == null) c = tryLg(Math.ceil(src._hitLogical as number));
              if (c != null) return Math.round(c * scope.horizontalPixelRatio);
            } catch {}
          }
          // Some code paths may have stored a logical index in _hitTime directly.
          // Try interpreting numeric _hitTime as a logical index and map it.
          if (src._hitTime != null && typeof src._hitTime === "number") {
            try {
              const maybeLogical = src._hitTime as number;
              const vr = (ts as any).visibleLogicalRange?.() ?? null;
              let lg = maybeLogical;
              if (
                vr &&
                typeof vr.from === "number" &&
                typeof vr.to === "number"
              ) {
                if (lg < vr.from) lg = vr.from;
                if (lg > vr.to) lg = vr.to;
              }
              const c = ts.logicalToCoordinate(lg as any);
              if (typeof c === "number")
                return Math.round(c * scope.horizontalPixelRatio);
            } catch {}
          }
          if (!src._hitTime) return null;
          const tryConvert = (t: any) => {
            try {
              const c = ts.timeToCoordinate(t as any);
              return typeof c === "number" ? c : null;
            } catch {
              return null;
            }
          };
          // try as-is
          let hitCoord = tryConvert(src._hitTime);
          // if numeric and looks like ms, try dividing by 1000
          if (hitCoord == null && typeof src._hitTime === "number") {
            const maybeMs = Math.floor(src._hitTime as number);
            if (maybeMs > 1e12) {
              hitCoord = tryConvert(Math.floor(maybeMs / 1000));
            }
            // some feeds may provide seconds but as float; also try *1000 fallback
            if (hitCoord == null && maybeMs < 1e12) {
              try {
                hitCoord = tryConvert(Math.floor(maybeMs * 1000));
              } catch {}
            }
          }
          // some sources may wrap time in an object; try common patterns
          if (
            hitCoord == null &&
            src._hitTime &&
            typeof src._hitTime === "object"
          ) {
            const tobj: any = src._hitTime;
            if (typeof tobj.time === "number") hitCoord = tryConvert(tobj.time);
            else if (typeof tobj.timestamp === "number")
              hitCoord = tryConvert(tobj.timestamp);
            else {
              // try common nested patterns like {t: ...}
              if (typeof tobj.t === "number") hitCoord = tryConvert(tobj.t);
            }
          }
          if (hitCoord != null)
            return Math.round(hitCoord * scope.horizontalPixelRatio);
          // If we couldn't map the hit by time/logical but the source reports a hit,
          // return the band's right device X so the arrow remains bound to the position.
          if ((src as any)._hit) {
            return Math.round(x + desiredBandDevice);
          }
          return null;
        };
        const computedHitDeviceX = computeHitDeviceX();
        if (computedHitDeviceX != null) {
          rightX = computedHitDeviceX;
        } else if ((v._source as any)._hit) {
          // If hit exists but couldn't map to a time coordinate, clamp the rightX
          // to the band's device right edge so the arrow stays visually bound.
          const bandRight = Math.round(x + desiredBandDevice);
          rightX = Math.min(bandRight, Math.round(scope.bitmapSize.width));
        }
        // debug: if hit exists but we didn't get a computed hit coord, log useful info
        if ((v._source as any)._hit && computedHitDeviceX == null) {
          try {
            // eslint-disable-next-line no-console
            console.debug("PositionTool renderer fallback", {
              hit: (v._source as any)._hit,
              hitTime: (v._source as any)._hitTime,
              hitLogical: (v._source as any)._hitLogical,
              entry: (v._source as any)._entry,
              entryX: entryX,
              desiredBandDevice,
              rightX,
            });
          } catch {}
        } else {
          try {
            // eslint-disable-next-line no-console
            console.debug(
              "PositionTool renderer: hitTime not mapped to device X",
              {
                hitTime: src._hitTime,
                entryLogical: src._entry?.logical,
                entryTime: src._entry?.time,
                rightXFallback: rightX,
              }
            );
            if (
              typeof window !== "undefined" &&
              window.location.hostname === "localhost"
            ) {
              // fire-and-forget to server-side debug route
              fetch("/api/dev-log", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  topic: "trend-position-miss",
                  hitTime: src._hitTime,
                  entryLogical: src._entry?.logical,
                  entryTime: src._entry?.time,
                  rightXFallback: rightX,
                }),
              }).catch(() => {});
            }
          } catch {}
        }

        // Ensure we never draw the band beyond the desired band device width
        rightX = Math.min(rightX, Math.round(x + desiredBandDevice));
        // draw shaded band from entry to rightX, with two colors for TP/SL zones vertically
        const available = Math.max(0, rightX - x);
        const bandWidth = Math.max(8, Math.min(desiredBandDevice, available));
        // draw TP area (between entry and tp price)
        ctx.fillStyle = v._options.tpColor;
        const topTp = Math.min(yEntry, yTp);
        const heightTp = Math.abs(yTp - yEntry);
        ctx.fillRect(x, topTp, bandWidth, heightTp);
        // draw SL area
        ctx.fillStyle = v._options.slColor;
        const topSl = Math.min(yEntry, ySl);
        const heightSl = Math.abs(ySl - yEntry);
        ctx.fillRect(x, topSl, bandWidth, heightSl);

        // draw dashed arrow from entry to the hit candle (if hit) or to the band edge
        ctx.strokeStyle = v._options.lineColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        // rightDeviceX: device pixel X for the right limit (hit coordinate or right edge)
        const rightDeviceX =
          computedHitDeviceX != null ? computedHitDeviceX : rightX;
        // choose arrow target Y: prefer the hit type if present
        const srcAny = v._source as any;
        let arrowY = yTp;
        if (srcAny._hit === "tp") arrowY = yTp;
        else if (srcAny._hit === "sl") arrowY = ySl;

        // If the hit coordinate wasn't mappable (off-screen), draw a small
        // off-screen indicator near the right edge and point the arrow to it.
        let indicatorX: number | null = null;
        if (computedHitDeviceX == null && srcAny._hit) {
          // position indicator near the rightX (which is clamped to the band's right edge when mapping fails)
          const screenRightInset = Math.round(24 * scope.horizontalPixelRatio);
          const maxIndicator =
            Math.round(scope.bitmapSize.width) - screenRightInset;
          const target = Math.round(
            rightX - Math.round(6 * scope.horizontalPixelRatio)
          );
          indicatorX = Math.max(x + 24, Math.min(target, maxIndicator));
          // draw small triangle indicator
          ctx.fillStyle = v._options.lineColor;
          ctx.beginPath();
          const triSize = 8 * scope.horizontalPixelRatio;
          ctx.moveTo(indicatorX, arrowY);
          ctx.lineTo(indicatorX - triSize, arrowY - triSize / 2);
          ctx.lineTo(indicatorX - triSize, arrowY + triSize / 2);
          ctx.closePath();
          ctx.fill();
          // draw label like "TP (off-screen)" or "SL (off-screen)"
          ctx.fillStyle = "#fff";
          ctx.font = `${10 * scope.horizontalPixelRatio}px Arial`;
          const label =
            srcAny._hit === "tp" ? "TP (off-screen)" : "SL (off-screen)";
          ctx.fillText(
            label,
            indicatorX -
              Math.round(6 * scope.horizontalPixelRatio) -
              ctx.measureText(label).width,
            arrowY - Math.round(10 * scope.verticalPixelRatio)
          );
        }

        // arrow endpoint x: prefer computed hit device X, otherwise use indicator or clamp
        const arrowXEnd = Math.max(
          x + 24,
          (computedHitDeviceX != null
            ? computedHitDeviceX
            : indicatorX ?? rightDeviceX) -
            Math.round(6 * scope.horizontalPixelRatio)
        );
        ctx.beginPath();
        ctx.moveTo(x, yEntry);
        ctx.lineTo(arrowXEnd, arrowY);
        ctx.stroke();
        ctx.setLineDash([]);
        // draw arrowhead (pointing to the endpoint)
        const headSize = 6 * scope.horizontalPixelRatio;
        ctx.beginPath();
        ctx.moveTo(arrowXEnd, arrowY);
        ctx.lineTo(arrowXEnd - headSize, arrowY - headSize / 2);
        ctx.lineTo(arrowXEnd - headSize, arrowY + headSize / 2);
        ctx.closePath();
        ctx.fillStyle = v._options.lineColor;
        ctx.fill();
        // borders (horizontal lines)
        ctx.strokeStyle = v._options.lineColor;
        ctx.lineWidth = v._options.width;
        ctx.beginPath();
        ctx.moveTo(x, yEntry);
        ctx.lineTo(x + bandWidth, yEntry);
        ctx.moveTo(x, yTp);
        ctx.lineTo(x + bandWidth, yTp);
        ctx.moveTo(x, ySl);
        ctx.lineTo(x + bandWidth, ySl);
        ctx.stroke();
        // labels with simple P/L and R:R box
        ctx.fillStyle = "#ffffff";
        ctx.font = `${12 * scope.horizontalPixelRatio}px Arial`;
        const plPerc = v._source._plPercent().toFixed(2) + "%";
        ctx.fillText(plPerc, x + 8, yEntry - 8);
        // R:R box
        try {
          const entry = v._source._entry.price;
          const tp = v._source._tp;
          const sl = v._source._sl;
          const risk = Math.abs(entry - sl);
          const reward = Math.abs(tp - entry);
          const rr = risk > 0 ? (reward / risk).toFixed(2) : "-";
          const label = `R:R ${rr}`;
          const m = ctx.measureText(label);
          const pad = 6 * scope.horizontalPixelRatio;
          const boxW = m.width + pad * 2;
          const boxH = 18 * scope.verticalPixelRatio;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(x + bandWidth - boxW - 8, yEntry - boxH - 8, boxW, boxH);
          ctx.fillStyle = "#fff";
          ctx.fillText(
            label,
            x + bandWidth - boxW - 8 + pad,
            yEntry - 8 + boxH / 2 - 4
          );
        } catch {}
      }
    );
  }
}

class PositionPaneView implements IPrimitivePaneView {
  _source: PositionTool;
  _coords: {
    entryX: Coordinate | null;
    entryY: Coordinate | null;
    tpY: Coordinate | null;
    slY: Coordinate | null;
  } = { entryX: null, entryY: null, tpY: null, slY: null };
  _options: PositionOptions;
  constructor(source: PositionTool) {
    this._source = source;
    this._options = source._options;
  }
  update() {
    const s = this._source;
    const ts = s._chart.timeScale();
    const entryX =
      typeof s._entry.logical === "number"
        ? ts.logicalToCoordinate(s._entry.logical as Logical)
        : ts.timeToCoordinate(s._entry.time as Time);
    const yEntry = s._series.priceToCoordinate(s._entry.price);
    const yTp = s._series.priceToCoordinate(s._tp);
    const ySl = s._series.priceToCoordinate(s._sl);
    this._coords = { entryX, entryY: yEntry, tpY: yTp, slY: ySl };
    this._options = s._options;
  }
  renderer(): IPrimitivePaneRenderer {
    return new PositionPaneRenderer(this);
  }
}

export class PositionTool implements ISeriesPrimitive<Time> {
  _chart: IChartApi;
  _series: ISeriesApi<keyof SeriesOptionsMap>;
  _entry: PositionPoint;
  _tp: Price;
  _sl: Price;
  _hit: "tp" | "sl" | null = null;
  _hitTime: Time | undefined = undefined;
  _hitLogical: number | undefined = undefined;
  // note: we store only hit time; convert to coordinates each render so arrow follows panning/zoom
  _paneViews: PositionPaneView[];
  _options: PositionOptions;

  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    entry: PositionPoint,
    tp: Price,
    sl: Price,
    options?: Partial<PositionOptions>
  ) {
    this._chart = chart;
    this._series = series;
    this._entry = entry;
    this._tp = tp;
    this._sl = sl;
    this._options = { ...defaultOptions, ...options };
    this._paneViews = [new PositionPaneView(this)];
  }

  paneViews() {
    return this._paneViews;
  }

  autoscaleInfo(start: Logical, end: Logical): AutoscaleInfo | null {
    const pmin = Math.min(this._entry.price, this._tp, this._sl);
    const pmax = Math.max(this._entry.price, this._tp, this._sl);
    return { priceRange: { minValue: pmin, maxValue: pmax } };
  }

  updateAllViews() {
    this._paneViews.forEach((v) => v.update());
  }

  // Called by the chart when a new historical or live bar arrives
  checkBar(bar: {
    open: number;
    high: number;
    low: number;
    close: number;
    time?: Time;
  }) {
    if (this._hit) return; // already hit
    const { high, low, time } = bar;
    // helper to robustly convert a Time to a timeScale coordinate
    const tryTimeToCoord = (t: any) => {
      try {
        const c = this._chart.timeScale().timeToCoordinate(t as any);
        return c ?? null;
      } catch {
        return null;
      }
    };
    if (this._options.side === "long") {
      if (high >= this._tp) {
        this._hit = "tp";
        this._hitTime = time;
        // try to capture a logical index for stable mapping (preferred)
        try {
          const ts = this._chart.timeScale();
          const tryConvert = (t: any) => {
            try {
              const c = ts.timeToCoordinate(t as any);
              if (typeof c === "number")
                return ts.coordinateToLogical(c as any);
            } catch {}
            return null;
          };
          let lg = tryConvert(time);
          if (lg == null && typeof time === "number") {
            const maybeMs = Math.floor(time as number);
            if (maybeMs > 1e12) lg = tryConvert(Math.floor(maybeMs / 1000));
          }
          if (lg == null && time && typeof time === "object") {
            const tobj: any = time;
            if (typeof tobj.time === "number") lg = tryConvert(tobj.time);
            else if (typeof tobj.timestamp === "number")
              lg = tryConvert(tobj.timestamp);
          }
          if (typeof lg === "number") this._hitLogical = lg;
        } catch {}
        try {
          // debug logging to help reproduce mapping issues
          // eslint-disable-next-line no-console
          console.debug("PositionTool hit=tp", {
            hitTime: this._hitTime,
            side: this._options.side,
            tp: this._tp,
            sl: this._sl,
          });
        } catch {}
        // compute a robust hit coordinate: try time as-is; if it looks like ms try dividing by 1000
        const tryTimeToCoord = (t: any) => {
          try {
            const c = this._chart.timeScale().timeToCoordinate(t as any);
            return c ?? null;
          } catch {
            return null;
          }
        };
        // store hit time only; renderer will compute coordinate dynamically
        // (tryTimeToCoord usage kept for consistency but we do not persist the coord)
        this.updateAllViews();
      } else if (low <= this._sl) {
        this._hit = "sl";
        this._hitTime = time;
        try {
          const ts = this._chart.timeScale();
          const tryConvert = (t: any) => {
            try {
              const c = ts.timeToCoordinate(t as any);
              if (typeof c === "number")
                return ts.coordinateToLogical(c as any);
            } catch {}
            return null;
          };
          let lg = tryConvert(time);
          if (lg == null && typeof time === "number") {
            const maybeMs = Math.floor(time as number);
            if (maybeMs > 1e12) lg = tryConvert(Math.floor(maybeMs / 1000));
          }
          if (lg == null && time && typeof time === "object") {
            const tobj: any = time;
            if (typeof tobj.time === "number") lg = tryConvert(tobj.time);
            else if (typeof tobj.timestamp === "number")
              lg = tryConvert(tobj.timestamp);
          }
          if (typeof lg === "number") this._hitLogical = lg;
        } catch {}
        try {
          // eslint-disable-next-line no-console
          console.debug("PositionTool hit=sl", {
            hitTime: this._hitTime,
            side: this._options.side,
            tp: this._tp,
            sl: this._sl,
          });
        } catch {}
        // store hit time only
        this.updateAllViews();
      }
    } else {
      // short
      if (low <= this._tp) {
        this._hit = "tp";
        this._hitTime = time;
        try {
          const ts = this._chart.timeScale();
          const tryConvert = (t: any) => {
            try {
              const c = ts.timeToCoordinate(t as any);
              if (typeof c === "number")
                return ts.coordinateToLogical(c as any);
            } catch {}
            return null;
          };
          let lg = tryConvert(time);
          if (lg == null && typeof time === "number") {
            const maybeMs = Math.floor(time as number);
            if (maybeMs > 1e12) lg = tryConvert(Math.floor(maybeMs / 1000));
          }
          if (lg == null && time && typeof time === "object") {
            const tobj: any = time;
            if (typeof tobj.time === "number") lg = tryConvert(tobj.time);
            else if (typeof tobj.timestamp === "number")
              lg = tryConvert(tobj.timestamp);
          }
          if (typeof lg === "number") this._hitLogical = lg;
        } catch {}
        try {
          // eslint-disable-next-line no-console
          console.debug("PositionTool hit=tp (short)", {
            hitTime: this._hitTime,
            side: this._options.side,
            tp: this._tp,
            sl: this._sl,
          });
        } catch {}
        // store hit time only
        this.updateAllViews();
      } else if (high >= this._sl) {
        this._hit = "sl";
        this._hitTime = time;
        try {
          const ts = this._chart.timeScale();
          const tryConvert = (t: any) => {
            try {
              const c = ts.timeToCoordinate(t as any);
              if (typeof c === "number")
                return ts.coordinateToLogical(c as any);
            } catch {}
            return null;
          };
          let lg = tryConvert(time);
          if (lg == null && typeof time === "number") {
            const maybeMs = Math.floor(time as number);
            if (maybeMs > 1e12) lg = tryConvert(Math.floor(maybeMs / 1000));
          }
          if (lg == null && time && typeof time === "object") {
            const tobj: any = time;
            if (typeof tobj.time === "number") lg = tryConvert(tobj.time);
            else if (typeof tobj.timestamp === "number")
              lg = tryConvert(tobj.timestamp);
          }
          if (typeof lg === "number") this._hitLogical = lg;
        } catch {}
        try {
          // eslint-disable-next-line no-console
          console.debug("PositionTool hit=sl (short)", {
            hitTime: this._hitTime,
            side: this._options.side,
            tp: this._tp,
            sl: this._sl,
          });
        } catch {}
        // store hit time only
        this.updateAllViews();
      }
    }
  }

  // internal hit test for tool logic
  isHit(px: number, py: number): "body" | "tp" | "sl" | null {
    const v = this._paneViews[0];
    const { entryX, entryY, tpY, slY } = v._coords;
    if (entryX == null || entryY == null || tpY == null || slY == null)
      return null;
    const bw = this._options.bandWidth ?? 120;
    const x2 = entryX + bw;
    const minY = Math.min(entryY, tpY, slY);
    const maxY = Math.max(entryY, tpY, slY);
    const edgeTolerance = 6;
    // allow a small tolerance outside band for resize handle
    if (px >= entryX - edgeTolerance && px <= x2 + edgeTolerance) {
      // check right-edge first for resize
      if (Math.abs(px - x2) <= edgeTolerance) return "resize" as any;
      if (Math.abs(py - tpY) <= edgeTolerance) return "tp";
      if (Math.abs(py - slY) <= edgeTolerance) return "sl";
      if (Math.abs(py - entryY) <= edgeTolerance) return "body"; // treat entry horizontal as body hit for dragging entry
      if (py >= minY && py <= maxY) return "body";
    }
    return null;
  }

  // allow external resize of band width (chart-coordinate units)
  setBandWidth(bw: number) {
    this._options.bandWidth = Math.max(8, bw);
    this.updateAllViews();
  }

  setEntry(pt: PositionPoint) {
    this._entry = pt;
    this.updateAllViews();
  }

  moveBy(deltaLogical: number, deltaPrice: number) {
    if (typeof this._entry.logical === "number")
      this._entry.logical += deltaLogical;
    this._entry.price += deltaPrice;
    this._tp += deltaPrice;
    this._sl += deltaPrice;
    this.updateAllViews();
  }

  setTp(price: number) {
    this._tp = price;
    this.updateAllViews();
  }
  setSl(price: number) {
    this._sl = price;
    this.updateAllViews();
  }

  getOptions() {
    return this._options;
  }
  updateOptions(opts: Partial<PositionOptions>) {
    this._options = { ...this._options, ...opts };
    this.updateAllViews();
  }

  // simple P/L percent from entry to tp depending on side
  _plPercent(): number {
    const diff =
      this._options.side === "long"
        ? this._tp - this._entry.price
        : this._entry.price - this._tp;
    return (diff / this._entry.price) * 100;
  }
}
