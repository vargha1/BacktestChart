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
  // preferred: horizontal band width in bars (logical units)
  bandBars?: number;
  // legacy: band width in chart coordinates (pixels) - deprecated; will be converted on first render
  bandWidth?: number;
}

const defaultOptions: PositionOptions = {
  side: "long",
  entryColor: "#8888ff55",
  tpColor: "#2ecc7055",
  slColor: "#e74c3c55",
  lineColor: "#ffffff",
  width: 2,
  bandBars: 30,
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
        let rightX = Math.round(scope.bitmapSize.width); // default right edge

        // Determine desired band device width from bandBars (logical units)
        // Fallback: if legacy bandWidth exists without bandBars, approximate bars using current scale
        const tsForBars = v._source._chart.timeScale();
        let entryLogicalForBars: number | null = null;
        try {
          entryLogicalForBars =
            typeof (v._source as any)._entry?.logical === "number"
              ? ((v._source as any)._entry.logical as number)
              : (tsForBars.coordinateToLogical(entryX as any) as number | null);
        } catch {}
        const bandBars =
          (v._options as any).bandBars ??
          ((): number => {
            // approximate from legacy pixel width if present
            const legacyPx = (v._options as any).bandWidth as number | undefined;
            if (
              legacyPx != null &&
              entryLogicalForBars != null &&
              typeof entryLogicalForBars === "number"
            ) {
              try {
                const toCoord = (lg: number) => tsForBars.logicalToCoordinate(lg as any) ?? 0;
                // find how many bars correspond to legacyPx (CSS px)
                const entryCssX = entryX as number;
                // scan a small range to estimate bar width in px
                const pxPerBar = (() => {
                  const c0 = toCoord(entryLogicalForBars);
                  const c1 = toCoord(entryLogicalForBars + 1);
                  const d = c1 != null && c0 != null ? Math.abs((c1 as number) - (c0 as number)) : 10;
                  return d || 10;
                })();
                const estBars = Math.max(1, Math.round(legacyPx / pxPerBar));
                // persist conversion so future renders use bars
                (v._source as any).updateOptions?.({ bandBars: estBars, bandWidth: undefined });
                return estBars;
              } catch {}
            }
            return 30;
          })();
        // convert bandBars to device pixels
        let desiredBandDevice = Math.round(24 * scope.horizontalPixelRatio); // min default
        try {
          if (
            entryLogicalForBars != null &&
            typeof entryLogicalForBars === "number" &&
            typeof bandBars === "number"
          ) {
            const targetLogical = entryLogicalForBars + bandBars;
            const targetCssX = tsForBars.logicalToCoordinate(targetLogical as any) as number | null;
            if (targetCssX != null) {
              const cssDelta = Math.max(0, (targetCssX as number) - (entryX as number));
              desiredBandDevice = Math.max(8, Math.round(cssDelta * scope.horizontalPixelRatio));
            }
          }
        } catch {}

        // compute hit coordinate robustly from stored _hitTime (no more cached _hitCoord)
        const computeHitDeviceX = (): number | null => {
          // prefer a stored logical index (stable) if available - this is the most reliable
          if (typeof src._hitLogical === "number") {
            try {
              const lg = src._hitLogical as number;
              // Convert logical directly to coordinate
              const c = ts.logicalToCoordinate(lg as any);
              if (typeof c === "number" && !isNaN(c) && isFinite(c)) {
                // Successfully mapped - return in device pixels
                return Math.round(c * scope.horizontalPixelRatio);
              }
              // Try with rounding variations if direct mapping failed
              const tryLg = (testLg: number) => {
                try {
                  const testC = ts.logicalToCoordinate(testLg as any);
                  if (typeof testC === "number" && !isNaN(testC) && isFinite(testC)) {
                    return testC;
                  }
                } catch {
                  // ignore
                }
                return null;
              };
              let c2 = tryLg(Math.round(lg));
              if (c2 == null) c2 = tryLg(Math.floor(lg));
              if (c2 == null) c2 = tryLg(Math.ceil(lg));
              if (c2 != null) return Math.round(c2 * scope.horizontalPixelRatio);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.debug("computeHitDeviceX from logical failed:", err, { hitLogical: src._hitLogical });
            }
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
        
        // Debug: Log if we have a hit but can't compute the coordinate
        if ((v._source as any)._hit && computedHitDeviceX == null) {
          // eslint-disable-next-line no-console
          console.debug("Hit exists but computedHitDeviceX is null", {
            hit: (v._source as any)._hit,
            hitTime: src._hitTime,
            hitLogical: src._hitLogical,
            entryX: x,
            entryLogical: src._entry?.logical,
          });
        }
        
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

        // =====================================================================
        // ARROW LOGIC: Point from entry towards the nearest target (TP or SL)
        // =====================================================================
        ctx.strokeStyle = v._options.lineColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);

        const source = v._source as any;
        const entryPrice = source._entry?.price as number;
        const tpPrice = source._tp as number;
        const slPrice = source._sl as number;
        const side = source._options?.side as PositionSide;
        const hasHit = source._hit === "tp" || source._hit === "sl";
        const lastClose = source._lastClose as number | undefined;

        // Step 1: Determine which target the arrow should point to (TP or SL)
        let targetPrice: number;
        let targetY: number;
        let targetLabel: string;

        if (hasHit) {
          // If hit occurred, arrow points to the hit target
          if (source._hit === "tp") {
            targetPrice = tpPrice;
            targetY = yTp;
            targetLabel = "TP";
          } else {
            targetPrice = slPrice;
            targetY = ySl;
            targetLabel = "SL";
          }
        } else {
          // No hit yet: point based on price movement direction relative to entry
          // For LONG: if price >= entry, point to TP (price moving up), else SL (price moving down)
          // For SHORT: if price <= entry, point to TP (price moving down), else SL (price moving up)
          const referencePrice = typeof lastClose === "number" ? lastClose : entryPrice;

          if (typeof referencePrice === "number" && typeof entryPrice === "number") {
            if (side === "long") {
              // Long position: TP is above entry, SL is below entry
              // If current price >= entry, we're moving toward TP
              if (referencePrice >= entryPrice) {
                targetPrice = tpPrice;
                targetY = yTp;
                targetLabel = "TP";
              } else {
                targetPrice = slPrice;
                targetY = ySl;
                targetLabel = "SL";
              }
            } else {
              // Short position: TP is below entry, SL is above entry
              // If current price <= entry, we're moving toward TP
              if (referencePrice <= entryPrice) {
                targetPrice = tpPrice;
                targetY = yTp;
                targetLabel = "TP";
              } else {
                targetPrice = slPrice;
                targetY = ySl;
                targetLabel = "SL";
              }
            }
          } else {
            // Fallback: use TP as default
            targetPrice = tpPrice;
            targetY = yTp;
            targetLabel = "TP";
          }
        }

        // Step 2: Determine arrow endpoint X coordinate
        // The arrow extends horizontally from entry, pointing toward the target line
        let arrowXEnd: number;

        if (hasHit && computedHitDeviceX != null) {
          // Hit occurred and we can map it: arrow points to the exact hit candle
          arrowXEnd = computedHitDeviceX;
          // Ensure arrow doesn't start before entry
          arrowXEnd = Math.max(x + Math.round(8 * scope.horizontalPixelRatio), arrowXEnd);
        } else if (hasHit && computedHitDeviceX == null) {
          // Hit occurred but off-screen: point to band right edge with indicator
          const bandRightDevice = Math.round(x + desiredBandDevice);
          arrowXEnd = Math.min(bandRightDevice, Math.round(scope.bitmapSize.width) - Math.round(24 * scope.horizontalPixelRatio));
          
          // Draw off-screen indicator
          const indicatorSize = 8 * scope.horizontalPixelRatio;
          ctx.fillStyle = v._options.lineColor;
          ctx.beginPath();
          ctx.moveTo(arrowXEnd, targetY);
          ctx.lineTo(arrowXEnd - indicatorSize, targetY - indicatorSize / 2);
          ctx.lineTo(arrowXEnd - indicatorSize, targetY + indicatorSize / 2);
          ctx.closePath();
          ctx.fill();

          // Draw label
          ctx.fillStyle = "#fff";
          ctx.font = `${10 * scope.horizontalPixelRatio}px Arial`;
          const label = `${targetLabel} (off-screen)`;
          const labelWidth = ctx.measureText(label).width;
          ctx.fillText(
            label,
            arrowXEnd - indicatorSize - labelWidth - Math.round(6 * scope.horizontalPixelRatio),
            targetY - Math.round(10 * scope.verticalPixelRatio)
          );
        } else {
          // No hit yet: arrow extends to the right edge of the band
          // The band right edge is determined by bandBars, converted to device pixels
          // Arrow should point at the target line at the band's right edge
          arrowXEnd = Math.round(x + desiredBandDevice);
          // Ensure arrow extends at least a minimum distance from entry
          const minArrowLength = Math.round(24 * scope.horizontalPixelRatio);
          arrowXEnd = Math.max(x + minArrowLength, arrowXEnd);
          // Don't let arrow extend beyond the visible chart
          arrowXEnd = Math.min(arrowXEnd, Math.round(scope.bitmapSize.width) - Math.round(12 * scope.horizontalPixelRatio));
        }

        // Step 3: Draw the arrow line from entry to target
        ctx.beginPath();
        ctx.moveTo(x, yEntry);
        ctx.lineTo(arrowXEnd, targetY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Step 4: Draw arrowhead pointing to the target
        const headSize = 6 * scope.horizontalPixelRatio;
        const dx = arrowXEnd - x;
        const dy = targetY - yEntry;
        const angle = Math.atan2(dy, dx);

        ctx.fillStyle = v._options.lineColor;
        ctx.beginPath();
        ctx.moveTo(arrowXEnd, targetY);
        ctx.lineTo(
          arrowXEnd - headSize * Math.cos(angle - Math.PI / 6),
          targetY - headSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          arrowXEnd - headSize * Math.cos(angle + Math.PI / 6),
          targetY - headSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
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
  _lastClose: number | undefined = undefined;
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
    logical?: number;
  }) {
    // always remember the most recent close for directional arrow logic
    this._lastClose = bar?.close;
    if (this._hit) return; // already hit
    const { high, low, time } = bar;
    
    // Try to get logical index for this bar - use provided logical or compute from time
    let barLogical: number | undefined = (bar as any).logical;
    if (barLogical == null && time != null) {
      try {
        const ts = this._chart.timeScale();
        const coord = ts.timeToCoordinate(time as any);
        if (typeof coord === "number") {
          const lg = ts.coordinateToLogical(coord as any);
          if (typeof lg === "number") barLogical = lg;
        }
      } catch {
        // ignore
      }
    }
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
        // Store the logical index for precise arrow positioning
        if (typeof barLogical === "number") {
          this._hitLogical = barLogical;
        } else {
          // Fallback: try to capture a logical index for stable mapping
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
        }
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
        this.updateAllViews();
      } else if (low <= this._sl) {
        this._hit = "sl";
        this._hitTime = time;
        // Store the logical index for precise arrow positioning
        if (typeof barLogical === "number") {
          this._hitLogical = barLogical;
        } else {
          // Fallback: try to capture a logical index for stable mapping
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
        }
        try {
          // eslint-disable-next-line no-console
          console.debug("PositionTool hit=sl", {
            hitTime: this._hitTime,
            side: this._options.side,
            tp: this._tp,
            sl: this._sl,
          });
        } catch {}
        this.updateAllViews();
      }
    } else {
      // short
      if (low <= this._tp) {
        this._hit = "tp";
        this._hitTime = time;
        // Store the logical index for precise arrow positioning
        if (typeof barLogical === "number") {
          this._hitLogical = barLogical;
        } else {
          // Fallback: try to capture a logical index for stable mapping
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
        }
        try {
          // eslint-disable-next-line no-console
          console.debug("PositionTool hit=tp (short)", {
            hitTime: this._hitTime,
            side: this._options.side,
            tp: this._tp,
            sl: this._sl,
          });
        } catch {}
        this.updateAllViews();
      } else if (high >= this._sl) {
        this._hit = "sl";
        this._hitTime = time;
        // Store the logical index for precise arrow positioning
        if (typeof barLogical === "number") {
          this._hitLogical = barLogical;
        } else {
          // Fallback: try to capture a logical index for stable mapping
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
        }
        try {
          // eslint-disable-next-line no-console
          console.debug("PositionTool hit=sl (short)", {
            hitTime: this._hitTime,
            side: this._options.side,
            tp: this._tp,
            sl: this._sl,
          });
        } catch {}
        this.updateAllViews();
      }
    }
  }

  // internal hit test for tool logic
  isHit(px: number, py: number): "body" | "tp" | "sl" | "resize" | null {
    const v = this._paneViews[0];
    const { entryX, entryY, tpY, slY } = v._coords;
    if (entryX == null || entryY == null || tpY == null || slY == null)
      return null;
    
    // Calculate band width in CSS coordinates from bandBars
    let bandWidthCss: number;
    try {
      const ts = this._chart.timeScale();
      const entryLogical = typeof this._entry.logical === "number" 
        ? this._entry.logical 
        : ts.coordinateToLogical(entryX as any) as number | null;
      
      if (entryLogical != null) {
        const bandBars = (this._options as any).bandBars ?? 30;
        const targetLogical = entryLogical + bandBars;
        const targetX = ts.logicalToCoordinate(targetLogical as any) as number | null;
        if (targetX != null) {
          bandWidthCss = Math.max(0, (targetX as number) - (entryX as number));
        } else {
          bandWidthCss = (this._options as any).bandWidth ?? 120; // fallback
        }
      } else {
        bandWidthCss = (this._options as any).bandWidth ?? 120; // fallback
      }
    } catch {
      bandWidthCss = (this._options as any).bandWidth ?? 120; // fallback
    }
    
    const x2 = entryX + bandWidthCss;
    const minY = Math.min(entryY, tpY, slY);
    const maxY = Math.max(entryY, tpY, slY);
    const edgeTolerance = 6;
    
    // allow a small tolerance outside band for resize handle
    if (px >= entryX - edgeTolerance && px <= x2 + edgeTolerance) {
      // check right-edge first for resize (within tolerance)
      if (Math.abs(px - x2) <= edgeTolerance) return "resize";
      if (Math.abs(py - tpY) <= edgeTolerance) return "tp";
      if (Math.abs(py - slY) <= edgeTolerance) return "sl";
      if (Math.abs(py - entryY) <= edgeTolerance) return "body"; // treat entry horizontal as body hit for dragging entry
      if (py >= minY && py <= maxY) return "body";
    }
    return null;
  }

  // allow external resize of band width (chart-coordinate units)
  setBandWidth(bw: number) {
    // bw is in CSS pixels (chart coordinates). Convert to bars and store as bandBars.
    try {
      const ts = this._chart.timeScale();
      // compute entry logical (preferred) or CSS X
      let entryLogical: number | null = null;
      let entryCssX: number | null = null;
      
      const entry = this._entry;
      if (typeof entry.logical === "number") {
        entryLogical = entry.logical;
        entryCssX = ts.logicalToCoordinate(entry.logical as any) as number | null;
      } else if (entry.time != null) {
        entryCssX = ts.timeToCoordinate(entry.time as any) as number | null;
        if (entryCssX != null) {
          entryLogical = ts.coordinateToLogical(entryCssX as any) as number | null;
        }
      }
      
      if (entryCssX != null && entryLogical != null) {
        // Calculate the logical coordinate at entryCssX + bw
        const targetCssX = (entryCssX as number) + bw;
        const targetLogical = ts.coordinateToLogical(targetCssX as any) as number | null;
        if (targetLogical != null) {
          const bars = Math.max(1, Math.round((targetLogical as number) - (entryLogical as number)));
          (this._options as any).bandBars = bars;
          (this._options as any).bandWidth = undefined; // clear legacy
          this.updateAllViews();
          return;
        }
      }
      
      // Fallback: if conversion fails, store approximate based on current scale
      const currentBandBars = (this._options as any).bandBars ?? 30;
      const entryX = entryCssX ?? (ts.logicalToCoordinate(entryLogical as any) as number | null);
      if (entryX != null) {
        // Estimate px per bar
        const testLogical = entryLogical ?? (ts.coordinateToLogical(entryX as any) as number | null);
        if (testLogical != null) {
          const nextLogical = testLogical + 1;
          const nextX = ts.logicalToCoordinate(nextLogical as any) as number | null;
          if (nextX != null) {
            const pxPerBar = Math.abs((nextX as number) - (entryX as number)) || 1;
            const estBars = Math.max(1, Math.round(bw / pxPerBar));
            (this._options as any).bandBars = estBars;
            (this._options as any).bandWidth = undefined;
          }
        }
      }
    } catch (err) {
      console.warn("setBandWidth error:", err);
    }
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
