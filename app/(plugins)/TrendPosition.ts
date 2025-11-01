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
  UTCTimestamp,
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
  bandBars?: number;
  bandWidth?: number; // deprecated - for backward compatibility
}

const DEFAULT_OPTIONS: PositionOptions = {
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

interface RenderCoordinates {
  entryX: Coordinate | null;
  entryY: Coordinate | null;
  tpY: Coordinate | null;
  slY: Coordinate | null;
  hitPriceY: Coordinate | null;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

class CoordinateConverter {
  constructor(private chart: IChartApi) {}

  timeToCoordinate(time: Time | undefined): Coordinate | null {
    if (!time) return null;
    try {
      const ts = this.chart.timeScale();
      let timeValue = time;

      // Handle numeric time values (could be seconds or milliseconds)
      if (typeof time === "number") {
        if (time > 1e12) {
          timeValue = Math.floor(time / 1000) as UTCTimestamp;
        } else {
          timeValue = Math.floor(time) as UTCTimestamp;
        }
      }

      return ts.timeToCoordinate(timeValue as any);
    } catch {
      return null;
    }
  }

  logicalToCoordinate(logical: number | undefined): Coordinate | null {
    if (typeof logical !== "number") return null;
    try {
      return this.chart.timeScale().logicalToCoordinate(logical as Logical);
    } catch {
      return null;
    }
  }

  coordinateToLogical(coord: Coordinate): number | null {
    try {
      const result = this.chart.timeScale().coordinateToLogical(coord as any);
      return typeof result === "number" ? result : null;
    } catch {
      return null;
    }
  }

  coordinateToTime(coord: Coordinate): Time | null {
    try {
      return this.chart.timeScale().coordinateToTime(coord as any);
    } catch {
      return null;
    }
  }
}

class BandWidthCalculator {
  constructor(
    private chart: IChartApi,
    private converter: CoordinateConverter
  ) {}

  calculateDeviceWidth(
    entryX: number,
    entryLogical: number | null,
    bandBars: number,
    scope: BitmapCoordinatesRenderingScope
  ): number {
    const MIN_WIDTH = 8;
    const DEFAULT_WIDTH = 24;

    try {
      if (entryLogical != null && typeof bandBars === "number") {
        const targetLogical = entryLogical + bandBars;
        const targetCssX = this.converter.logicalToCoordinate(targetLogical);

        if (targetCssX != null) {
          const cssDelta = Math.max(0, targetCssX - entryX);
          return Math.max(
            MIN_WIDTH,
            Math.round(cssDelta * scope.horizontalPixelRatio)
          );
        }
      }
    } catch {
      // Fall through to default
    }

    return Math.round(DEFAULT_WIDTH * scope.horizontalPixelRatio);
  }

  convertLegacyBandWidth(
    legacyPixelWidth: number,
    entryLogical: number
  ): number {
    try {
      const ts = this.chart.timeScale();
      const entryX = this.converter.logicalToCoordinate(entryLogical);

      if (entryX == null) return 30;

      // Estimate pixels per bar
      const nextLogical = entryLogical + 1;
      const nextX = this.converter.logicalToCoordinate(nextLogical);

      if (nextX == null) return 30;

      const pixelsPerBar = Math.abs(nextX - entryX) || 10;
      return Math.max(1, Math.round(legacyPixelWidth / pixelsPerBar));
    } catch {
      return 30;
    }
  }
}

class HitDetector {
  computeHitDeviceX(
    source: any,
    scope: BitmapCoordinatesRenderingScope,
    entryDeviceX: number,
    bandDeviceWidth: number,
    converter: CoordinateConverter
  ): number | null {
    const ts = source._chart.timeScale();

    // Priority 1: Use stored logical index (most reliable)
    if (typeof source._hitLogical === "number") {
      const coord = converter.logicalToCoordinate(source._hitLogical);
      if (coord != null) {
        return Math.round(coord * scope.horizontalPixelRatio);
      }
    }

    // Priority 2: Try converting numeric _hitTime as logical index
    if (typeof source._hitTime === "number") {
      const coord = converter.logicalToCoordinate(source._hitTime);
      if (coord != null) {
        return Math.round(coord * scope.horizontalPixelRatio);
      }
    }

    // Priority 3: Convert _hitTime as actual time
    if (source._hitTime) {
      const coord = converter.timeToCoordinate(source._hitTime);
      if (coord != null) {
        return Math.round(coord * scope.horizontalPixelRatio);
      }
    }

    // Priority 4: If hit exists but off-screen, return band right edge
    if (source._hit) {
      return Math.round(entryDeviceX + bandDeviceWidth);
    }

    return null;
  }
}

// ============================================================================
// RENDERER
// ============================================================================

class PositionPaneRenderer implements IPrimitivePaneRenderer {
  constructor(private view: PositionPaneView) {}

  draw(target: CanvasRenderingTarget2D) {
    this.view.update();

    const { entryX, entryY, tpY, slY } = this.view._coords;
    if (entryX == null || entryY == null || tpY == null || slY == null) return;

    target.useBitmapCoordinateSpace((scope) => {
      const renderer = new BitmapRenderer(scope, this.view, {
        entryX,
        entryY,
        tpY,
        slY,
      });
      renderer.render();
    });
  }
}

class BitmapRenderer {
  private ctx: CanvasRenderingContext2D;
  private converter: CoordinateConverter;
  private bandCalc: BandWidthCalculator;
  private hitDetector: HitDetector;

  constructor(
    private scope: BitmapCoordinatesRenderingScope,
    private view: PositionPaneView,
    private coords: { entryX: number; entryY: number; tpY: number; slY: number }
  ) {
    this.ctx = scope.context;
    const source = view._source as any;
    this.converter = new CoordinateConverter(source._chart);
    this.bandCalc = new BandWidthCalculator(source._chart, this.converter);
    this.hitDetector = new HitDetector();
  }

  render() {
    const deviceCoords = this.calculateDeviceCoordinates();
    const bandWidth = this.calculateBandWidth(deviceCoords);

    this.drawBands(deviceCoords, bandWidth);
    this.drawArrow(deviceCoords, bandWidth);
    this.drawBorders(deviceCoords, bandWidth);
    this.drawLabels(deviceCoords, bandWidth);
  }

  private calculateDeviceCoordinates() {
    return {
      x: Math.round(this.coords.entryX * this.scope.horizontalPixelRatio),
      yEntry: Math.round(this.coords.entryY * this.scope.verticalPixelRatio),
      yTp: Math.round(this.coords.tpY * this.scope.verticalPixelRatio),
      ySl: Math.round(this.coords.slY * this.scope.verticalPixelRatio),
    };
  }

  private calculateBandWidth(
    deviceCoords: ReturnType<typeof this.calculateDeviceCoordinates>
  ): number {
    const source = this.view._source as any;
    const entryLogical = this.getEntryLogical();

    const bandBars = this.getBandBars(entryLogical);
    const desiredWidth = this.bandCalc.calculateDeviceWidth(
      this.coords.entryX,
      entryLogical,
      bandBars,
      this.scope
    );

    const available = Math.max(0, this.scope.bitmapSize.width - deviceCoords.x);
    return Math.max(8, Math.min(desiredWidth, available));
  }

  private getEntryLogical(): number | null {
    const source = this.view._source as any;

    if (typeof source._entry?.logical === "number") {
      return source._entry.logical;
    }

    return this.converter.coordinateToLogical(this.coords.entryX as Coordinate);
  }

  private getBandBars(entryLogical: number | null): number {
    const source = this.view._source as any;
    const options = this.view._options as any;

    if (typeof options.bandBars === "number") {
      return options.bandBars;
    }

    // Convert legacy bandWidth to bandBars
    if (typeof options.bandWidth === "number" && entryLogical != null) {
      const converted = this.bandCalc.convertLegacyBandWidth(
        options.bandWidth,
        entryLogical
      );

      // Persist conversion
      if (source.updateOptions) {
        source.updateOptions({ bandBars: converted, bandWidth: undefined });
      }

      return converted;
    }

    return 30;
  }

  private drawBands(
    deviceCoords: ReturnType<typeof this.calculateDeviceCoordinates>,
    bandWidth: number
  ) {
    const { x, yEntry, yTp, ySl } = deviceCoords;

    // TP zone
    this.ctx.fillStyle = this.view._options.tpColor;
    const topTp = Math.min(yEntry, yTp);
    const heightTp = Math.abs(yTp - yEntry);
    this.ctx.fillRect(x, topTp, bandWidth, heightTp);

    // SL zone
    this.ctx.fillStyle = this.view._options.slColor;
    const topSl = Math.min(yEntry, ySl);
    const heightSl = Math.abs(ySl - yEntry);
    this.ctx.fillRect(x, topSl, bandWidth, heightSl);
  }

  private drawArrow(
    deviceCoords: ReturnType<typeof this.calculateDeviceCoordinates>,
    bandWidth: number
  ) {
    const source = this.view._source as any;
    const { x, yEntry, yTp, ySl } = deviceCoords;

    const target = this.determineArrowTarget(deviceCoords);
    const arrowEndX = this.calculateArrowEndX(x, bandWidth, target);

    // Draw dashed line
    this.ctx.strokeStyle = this.view._options.lineColor;
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([8, 6]);
    this.ctx.beginPath();
    this.ctx.moveTo(x, yEntry);
    this.ctx.lineTo(arrowEndX, target.y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Draw arrowhead
    this.drawArrowhead(x, yEntry, arrowEndX, target.y);

    // Draw off-screen indicator if needed
    if (target.isOffScreen) {
      this.drawOffScreenIndicator(arrowEndX, target.y, target.label);
    }
  }

  private determineArrowTarget(
    deviceCoords: ReturnType<typeof this.calculateDeviceCoordinates>
  ) {
    const source = this.view._source as any;
    const { yTp, ySl, yEntry } = deviceCoords;

    const hasHit = source._hit === "tp" || source._hit === "sl";

    if (hasHit) {
      return {
        y: source._hit === "tp" ? yTp : ySl,
        label: source._hit === "tp" ? "TP" : "SL",
        isOffScreen: false,
      };
    }

    // Determine target based on price movement
    const side = source._options?.side as PositionSide;
    const entryPrice = source._entry?.price as number;
    const lastClose = source._lastClose as number | undefined;
    const referencePrice = lastClose ?? entryPrice;

    const isMovingTowardsTP =
      side === "long"
        ? referencePrice >= entryPrice
        : referencePrice <= entryPrice;

    return {
      y: isMovingTowardsTP ? yTp : ySl,
      label: isMovingTowardsTP ? "TP" : "SL",
      isOffScreen: false,
    };
  }

  private calculateArrowEndX(
    entryX: number,
    bandWidth: number,
    target: { isOffScreen: boolean }
  ): number {
    const source = this.view._source as any;
    const hasHit = source._hit === "tp" || source._hit === "sl";

    if (hasHit) {
      const hitX = this.hitDetector.computeHitDeviceX(
        source,
        this.scope,
        entryX,
        bandWidth,
        this.converter
      );

      if (hitX != null) {
        // Clamp to reasonable bounds
        const minX = entryX + Math.round(8 * this.scope.horizontalPixelRatio);
        const maxX =
          this.scope.bitmapSize.width -
          Math.round(12 * this.scope.horizontalPixelRatio);
        return Math.max(minX, Math.min(hitX, maxX));
      }

      // Hit exists but off-screen
      target.isOffScreen = true;
      return Math.min(
        entryX + bandWidth,
        this.scope.bitmapSize.width -
          Math.round(24 * this.scope.horizontalPixelRatio)
      );
    }

    // No hit: extend to band edge
    const minLength = Math.round(24 * this.scope.horizontalPixelRatio);
    const maxX =
      this.scope.bitmapSize.width -
      Math.round(12 * this.scope.horizontalPixelRatio);
    return Math.min(Math.max(entryX + minLength, entryX + bandWidth), maxX);
  }

  private drawArrowhead(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ) {
    const headSize = 6 * this.scope.horizontalPixelRatio;
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx);

    this.ctx.fillStyle = this.view._options.lineColor;
    this.ctx.beginPath();
    this.ctx.moveTo(endX, endY);
    this.ctx.lineTo(
      endX - headSize * Math.cos(angle - Math.PI / 6),
      endY - headSize * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      endX - headSize * Math.cos(angle + Math.PI / 6),
      endY - headSize * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawOffScreenIndicator(x: number, y: number, label: string) {
    const indicatorSize = 8 * this.scope.horizontalPixelRatio;

    this.ctx.fillStyle = this.view._options.lineColor;
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x - indicatorSize, y - indicatorSize / 2);
    this.ctx.lineTo(x - indicatorSize, y + indicatorSize / 2);
    this.ctx.closePath();
    this.ctx.fill();

    // Label
    this.ctx.fillStyle = "#fff";
    this.ctx.font = `${10 * this.scope.horizontalPixelRatio}px Arial`;
    const text = `${label} (off-screen)`;
    const labelWidth = this.ctx.measureText(text).width;
    this.ctx.fillText(
      text,
      x -
        indicatorSize -
        labelWidth -
        Math.round(6 * this.scope.horizontalPixelRatio),
      y - Math.round(10 * this.scope.verticalPixelRatio)
    );
  }

  private drawBorders(
    deviceCoords: ReturnType<typeof this.calculateDeviceCoordinates>,
    bandWidth: number
  ) {
    const { x, yEntry, yTp, ySl } = deviceCoords;

    this.ctx.strokeStyle = this.view._options.lineColor;
    this.ctx.lineWidth = this.view._options.width;
    this.ctx.beginPath();
    this.ctx.moveTo(x, yEntry);
    this.ctx.lineTo(x + bandWidth, yEntry);
    this.ctx.moveTo(x, yTp);
    this.ctx.lineTo(x + bandWidth, yTp);
    this.ctx.moveTo(x, ySl);
    this.ctx.lineTo(x + bandWidth, ySl);
    this.ctx.stroke();
  }

  private drawLabels(
    deviceCoords: ReturnType<typeof this.calculateDeviceCoordinates>,
    bandWidth: number
  ) {
    const { x, yEntry } = deviceCoords;
    const source = this.view._source;

    // P/L percentage
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = `${12 * this.scope.horizontalPixelRatio}px Arial`;
    const plPerc = source._plPercent().toFixed(2) + "%";
    this.ctx.fillText(plPerc, x + 8, yEntry - 8);

    // Risk:Reward ratio
    this.drawRiskRewardBox(x, yEntry, bandWidth);
  }

  private drawRiskRewardBox(x: number, yEntry: number, bandWidth: number) {
    try {
      const source = this.view._source;
      const entry = source._entry.price;
      const tp = source._tp;
      const sl = source._sl;

      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      const rr = risk > 0 ? (reward / risk).toFixed(2) : "-";

      const label = `R:R ${rr}`;
      const m = this.ctx.measureText(label);
      const pad = 6 * this.scope.horizontalPixelRatio;
      const boxW = m.width + pad * 2;
      const boxH = 18 * this.scope.verticalPixelRatio;

      this.ctx.fillStyle = "rgba(0,0,0,0.6)";
      this.ctx.fillRect(
        x + bandWidth - boxW - 8,
        yEntry - boxH - 8,
        boxW,
        boxH
      );

      this.ctx.fillStyle = "#fff";
      this.ctx.fillText(
        label,
        x + bandWidth - boxW - 8 + pad,
        yEntry - 8 + boxH / 2 - 4
      );
    } catch {
      // Silently fail if R:R calculation fails
    }
  }
}

// ============================================================================
// VIEW
// ============================================================================

class PositionPaneView implements IPrimitivePaneView {
  _coords: RenderCoordinates = {
    entryX: null,
    entryY: null,
    tpY: null,
    slY: null,
    hitPriceY: null,
  };

  constructor(public _source: PositionTool, public _options: PositionOptions) {}

  update() {
    const converter = new CoordinateConverter(this._source._chart);

    const entryX = this.calculateEntryX(converter);
    const entryY = this._source._series.priceToCoordinate(
      this._source._entry.price
    );
    const tpY = this._source._series.priceToCoordinate(this._source._tp);
    const slY = this._source._series.priceToCoordinate(this._source._sl);
    const hitPriceY = this.calculateHitPriceY();

    this._coords = { entryX, entryY: entryY, tpY, slY, hitPriceY };
    this._options = this._source._options;
  }

  private calculateEntryX(converter: CoordinateConverter): Coordinate | null {
    // Try logical first (most reliable)
    if (typeof this._source._entry.logical === "number") {
      const coord = converter.logicalToCoordinate(this._source._entry.logical);
      if (coord != null) return coord;
    }

    // Try time
    if (this._source._entry.time != null) {
      return converter.timeToCoordinate(this._source._entry.time);
    }

    return null;
  }

  private calculateHitPriceY(): Coordinate | null {
    if (!this._source._hit || typeof this._source._hitPrice !== "number") {
      return null;
    }

    const coord = this._source._series.priceToCoordinate(
      this._source._hitPrice
    );
    return coord != null && typeof coord === "number" ? coord : null;
  }

  renderer(): IPrimitivePaneRenderer {
    return new PositionPaneRenderer(this);
  }
}

// ============================================================================
// MAIN TOOL CLASS
// ============================================================================

export class PositionTool implements ISeriesPrimitive<Time> {
  _chart: IChartApi;
  _series: ISeriesApi<keyof SeriesOptionsMap>;
  _entry: PositionPoint;
  _tp: Price;
  _sl: Price;
  _hit: "tp" | "sl" | null = null;
  _hitTime: Time | undefined = undefined;
  _hitLogical: number | undefined = undefined;
  _hitPrice: number | undefined = undefined;
  _lastClose: number | undefined = undefined;
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
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._paneViews = [new PositionPaneView(this, this._options)];

    // Initialize after chart is ready
    setTimeout(() => {
      this.updateAllViews();
      this.checkAllHistoricalBars();
    }, 100);
  }

  paneViews() {
    return this._paneViews;
  }

  autoscaleInfo(start: Logical, end: Logical): AutoscaleInfo | null {
    const prices = [this._entry.price, this._tp, this._sl];
    return {
      priceRange: {
        minValue: Math.min(...prices),
        maxValue: Math.max(...prices),
      },
    };
  }

  updateAllViews() {
    this._paneViews.forEach((v) => v.update());
  }

  checkAllHistoricalBars() {
    if (this._hit || !this._series || !this._chart) return;

    try {
      const allData = (this._series as any).data?.() || [];
      if (!Array.isArray(allData) || allData.length === 0) return;

      const sortedBars = this.sortBarsByTime(allData);

      for (const bar of sortedBars) {
        if (this._hit) break;
        if (this.shouldCheckBar(bar)) {
          this.checkBar(bar);
        }
      }

      if (this._hit) {
        this.updateAllViews();
      }
    } catch (err) {
      console.warn("checkAllHistoricalBars error:", err);
    }
  }

  private sortBarsByTime(bars: any[]): any[] {
    return [...bars].sort((a, b) => {
      const getTime = (bar: any) => {
        if (typeof bar.time === "number") return bar.time;
        return bar.time?.time || bar.time?.timestamp || 0;
      };
      return getTime(a) - getTime(b);
    });
  }

  private shouldCheckBar(bar: any): boolean {
    const barLogical = this.getBarLogical(bar);
    const barTime = bar.time;

    // Compare by logical index (preferred)
    if (this._entry.logical != null && barLogical != null) {
      return barLogical > this._entry.logical;
    }

    // Fallback to time comparison
    if (this._entry.time != null && barTime != null) {
      const entryTime = this.extractTimeValue(this._entry.time);
      const currentTime = this.extractTimeValue(barTime);
      return currentTime > entryTime;
    }

    // If can't compare, check anyway to be safe
    return true;
  }

  private getBarLogical(bar: any): number | undefined {
    if (typeof bar.logical === "number") return bar.logical;

    if (bar.time != null) {
      try {
        const converter = new CoordinateConverter(this._chart);
        const coord = converter.timeToCoordinate(bar.time);
        if (coord != null) {
          return converter.coordinateToLogical(coord) ?? undefined;
        }
      } catch {
        // Fall through
      }
    }

    return undefined;
  }

  private extractTimeValue(time: any): number {
    if (typeof time === "number") return time;
    if (typeof time === "object" && time) {
      return time.time || time.timestamp || 0;
    }
    return 0;
  }

  checkBar(bar: {
    open: number;
    high: number;
    low: number;
    close: number;
    time?: Time;
    logical?: number;
  }) {
    this._lastClose = bar.close;
    if (this._hit) return;

    if (!this.shouldCheckBar(bar)) return;

    const barLogical = this.getBarLogical(bar);

    if (this._options.side === "long") {
      if (bar.high >= this._tp) {
        this.recordHit("tp", bar.time, barLogical, bar.high);
      } else if (bar.low <= this._sl) {
        this.recordHit("sl", bar.time, barLogical, bar.low);
      }
    } else {
      // short
      if (bar.low <= this._tp) {
        this.recordHit("tp", bar.time, barLogical, bar.low);
      } else if (bar.high >= this._sl) {
        this.recordHit("sl", bar.time, barLogical, bar.high);
      }
    }
  }

  private recordHit(
    type: "tp" | "sl",
    time: Time | undefined,
    logical: number | undefined,
    price: number
  ) {
    this._hit = type;
    this._hitTime = time;
    this._hitLogical = logical;
    this._hitPrice = price;

    console.log(`[PositionTool] Hit ${type.toUpperCase()} detected:`, {
      hitTime: time,
      hitLogical: logical,
      hitPrice: price,
      side: this._options.side,
    });

    this.updateAllViews();
  }

  isHit(px: number, py: number): "body" | "tp" | "sl" | "resize" | null {
    const v = this._paneViews[0];
    if (!v) return null;

    // Ensure coordinates are up-to-date
    for (let i = 0; i < 3; i++) {
      v.update();
      if (v._coords.entryX != null) break;
    }

    const { entryX, entryY, tpY, slY } = v._coords;
    if (entryX == null || entryY == null || tpY == null || slY == null) {
      return null;
    }

    const bandWidth = this.calculateBandWidthCss();
    const x2 = entryX + bandWidth;
    const tolerance = 6;

    if (px >= entryX - tolerance && px <= x2 + tolerance) {
      // Check resize handle first
      if (Math.abs(px - x2) <= tolerance) return "resize";

      // Check horizontal lines
      if (Math.abs(py - tpY) <= tolerance) return "tp";
      if (Math.abs(py - slY) <= tolerance) return "sl";
      if (Math.abs(py - entryY) <= tolerance) return "body";

      // Check if inside band vertically
      const minY = Math.min(entryY, tpY, slY);
      const maxY = Math.max(entryY, tpY, slY);
      if (py >= minY && py <= maxY) return "body";
    }

    return null;
  }

  private calculateBandWidthCss(): number {
    try {
      const converter = new CoordinateConverter(this._chart);
      const entryX = converter.logicalToCoordinate(this._entry.logical);
      const entryLogical = this._entry.logical;

      if (entryX != null && entryLogical != null) {
        const bandBars = (this._options as any).bandBars ?? 30;
        const targetLogical = entryLogical + bandBars;
        const targetX = converter.logicalToCoordinate(targetLogical);

        if (targetX != null) {
          return Math.max(0, targetX - entryX);
        }
      }
    } catch {
      // Fall through to default
    }

    return (this._options as any).bandWidth ?? 120;
  }

  setBandWidth(newWidthCss: number) {
    // Preserve hit state during resize
    const preservedState = {
      hit: this._hit,
      hitTime: this._hitTime,
      hitLogical: this._hitLogical,
      hitPrice: this._hitPrice,
    };

    try {
      const converter = new CoordinateConverter(this._chart);
      const entryLogical = this._entry.logical;
      const entryX = converter.logicalToCoordinate(entryLogical);

      if (entryLogical != null && entryX != null) {
        const targetX = entryX + newWidthCss;
        const targetLogical = converter.coordinateToLogical(targetX as Coordinate);

        if (targetLogical != null) {
          const bars = Math.max(1, Math.round(targetLogical - entryLogical));
          (this._options as any).bandBars = bars;
          (this._options as any).bandWidth = undefined;
        }
      }
    } catch (err) {
      console.warn("setBandWidth error:", err);
    }

    // Restore hit state
    this._hit = preservedState.hit;
    this._hitTime = preservedState.hitTime;
    this._hitLogical = preservedState.hitLogical;
    this._hitPrice = preservedState.hitPrice;

    this.updateAllViews();
  }

  setEntry(pt: PositionPoint) {
    this._entry = this.enrichPoint(pt);
    this.resetHitState();
    this.updateAllViews();
  }

  private enrichPoint(pt: PositionPoint): PositionPoint {
    const converter = new CoordinateConverter(this._chart);
    const enriched = { ...pt };

    // Try to add logical if missing
    if (typeof enriched.logical !== "number" && enriched.time != null) {
      const coord = converter.timeToCoordinate(enriched.time);
      if (coord != null) {
        const logical = converter.coordinateToLogical(coord);
        if (typeof logical === "number") {
          enriched.logical = logical;
        }
      }
    }

    // Try to add time if missing
    if (enriched.time == null && typeof enriched.logical === "number") {
      const coord = converter.logicalToCoordinate(enriched.logical);
      if (coord != null) {
        const time = converter.coordinateToTime(coord);
        if (time != null) {
          enriched.time = time;
        }
      }
    }

    return enriched;
  }

  private resetHitState() {
    this._hit = null;
    this._hitTime = undefined;
    this._hitLogical = undefined;
    this._hitPrice = undefined;
  }

  moveBy(deltaLogical: number, deltaPrice: number) {
    if (typeof this._entry.logical === "number") {
      this._entry.logical += deltaLogical;

      // Update time to match new logical position
      const converter = new CoordinateConverter(this._chart);
      const coord = converter.logicalToCoordinate(this._entry.logical);
      if (coord != null) {
        const time = converter.coordinateToTime(coord);
        if (time != null) {
          this._entry.time = time;
        }
      }
    }

    this._entry.price += deltaPrice;
    this._tp += deltaPrice;
    this._sl += deltaPrice;

    this.resetHitState();
    this.updateAllViews();
  }

  setTp(price: number) {
    this._tp = price;
    this.resetHitState();
    this.updateAllViews();
  }

  setSl(price: number) {
    this._sl = price;
    this.resetHitState();
    this.updateAllViews();
  }

  getOptions() {
    return this._options;
  }

  updateOptions(opts: Partial<PositionOptions>) {
    this._options = { ...this._options, ...opts };
    this.updateAllViews();
  }

  _plPercent(): number {
    const diff =
      this._options.side === "long"
        ? this._tp - this._entry.price
        : this._entry.price - this._tp;
    return (diff / this._entry.price) * 100;
  }
}
