import {
  CanvasRenderingTarget2D,
  BitmapCoordinatesRenderingScope,
} from "fancy-canvas";
import {
  AutoscaleInfo,
  Coordinate,
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  SeriesOptionsMap,
  SeriesType,
  Time,
} from "lightweight-charts";

// ============================================================================
// TYPES
// ============================================================================

interface ViewPoint {
  x: Coordinate | null;
  y: Coordinate | null;
}

interface Point {
  time: Time;
  price: number;
  logical?: number;
}

export interface TrendLineOptions {
  lineColor: string;
  width: number;
  showLabels: boolean;
  labelBackgroundColor: string;
  labelTextColor: string;
  lineStyle: "solid" | "dashed";
}

const DEFAULT_OPTIONS: TrendLineOptions = {
  lineColor: "#FFFFFF",
  width: 3,
  showLabels: true,
  labelBackgroundColor: "#404040",
  labelTextColor: "#FFFFFF",
  lineStyle: "solid",
};

// ============================================================================
// COORDINATE HELPER
// ============================================================================

class CoordinateHelper {
  constructor(
    private chart: IChartApi,
    private series: ISeriesApi<keyof SeriesOptionsMap>
  ) {}

  getX(point: Point): Coordinate | null {
    const ts = this.chart.timeScale();

    // Prefer logical coordinate
    if (typeof point.logical === "number") {
      return ts.logicalToCoordinate(point.logical as Logical);
    }

    // Fallback to time
    return ts.timeToCoordinate(point.time);
  }

  getY(price: number): Coordinate | null {
    return this.series.priceToCoordinate(price);
  }

  getLogicalIndex(point: Point): number | null {
    const ts = this.chart.timeScale();

    const x = this.getX(point);
    if (x === null) return null;

    const logical = ts.coordinateToLogical(x);
    return typeof logical === "number" ? logical : null;
  }
}

// ============================================================================
// RENDERER
// ============================================================================

class TrendLinePaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private p1: ViewPoint,
    private p2: ViewPoint,
    private text1: string,
    private text2: string,
    private options: TrendLineOptions
  ) {}

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace((scope) => {
      if (
        this.p1.x === null ||
        this.p1.y === null ||
        this.p2.x === null ||
        this.p2.y === null
      ) {
        return;
      }

      const renderer = new BitmapLineRenderer(
        scope,
        this.p1,
        this.p2,
        this.options
      );

      renderer.drawLine();

      if (this.options.showLabels) {
        renderer.drawLabels(this.text1, this.text2);
      }
    });
  }
}

class BitmapLineRenderer {
  private ctx: CanvasRenderingContext2D;
  private x1: number;
  private y1: number;
  private x2: number;
  private y2: number;

  constructor(
    private scope: BitmapCoordinatesRenderingScope,
    p1: ViewPoint,
    p2: ViewPoint,
    private options: TrendLineOptions
  ) {
    this.ctx = scope.context;
    this.x1 = Math.round(p1.x! * scope.horizontalPixelRatio);
    this.y1 = Math.round(p1.y! * scope.verticalPixelRatio);
    this.x2 = Math.round(p2.x! * scope.horizontalPixelRatio);
    this.y2 = Math.round(p2.y! * scope.verticalPixelRatio);
  }

  drawLine() {
    this.ctx.lineWidth = this.options.width;
    this.ctx.strokeStyle = this.options.lineColor;

    // Set line style
    if (this.options.lineStyle === "dashed") {
      this.ctx.setLineDash([10, 3]);
    } else {
      this.ctx.setLineDash([]);
    }

    this.ctx.beginPath();
    this.ctx.moveTo(this.x1, this.y1);
    this.ctx.lineTo(this.x2, this.y2);
    this.ctx.stroke();

    // Reset line dash
    this.ctx.setLineDash([]);
  }

  drawLabels(text1: string, text2: string) {
    const midX = (this.x1 + this.x2) / 2;
    const midY = (this.y1 + this.y2) / 2 - 20;

    this.drawCenterLabel("", midX, midY);
  }

  private drawCenterLabel(text: string, x: number, y: number) {
    this.ctx.font = "13px Arial";
    const offset = 5 * this.scope.horizontalPixelRatio;
    const textWidth = this.ctx.measureText(text).width;

    const bgX = x - textWidth / 2 - offset;
    const bgY = y - 24 - offset;
    const bgWidth = textWidth + offset * 2;
    const bgHeight = 24 + offset;

    // Draw background
    this.ctx.fillStyle = this.options.labelBackgroundColor;
    this.ctx.beginPath();
    this.ctx.roundRect(bgX, bgY, bgWidth, bgHeight, 5);
    this.ctx.fill();

    // Draw text
    this.ctx.fillStyle = this.options.labelTextColor;
    this.ctx.fillText(text, x - textWidth / 2, y - 5);
  }
}

// ============================================================================
// VIEW
// ============================================================================

class TrendLinePaneView implements IPrimitivePaneView {
  private p1: ViewPoint = { x: null, y: null };
  private p2: ViewPoint = { x: null, y: null };

  constructor(private source: TrendLine) {}

  update() {
    const helper = new CoordinateHelper(
      this.source._chart,
      this.source._series
    );

    this.p1 = {
      x: helper.getX(this.source._p1),
      y: helper.getY(this.source._p1.price),
    };

    this.p2 = {
      x: helper.getX(this.source._p2),
      y: helper.getY(this.source._p2.price),
    };
  }

  renderer(): IPrimitivePaneRenderer {
    return new TrendLinePaneRenderer(
      this.p1,
      this.p2,
      this.source._p1.price.toFixed(1),
      this.source._p2.price.toFixed(1),
      this.source._options
    );
  }
}

// ============================================================================
// HIT TESTER
// ============================================================================

class HitTester {
  constructor(private tolerance: number = 8) {}

  test(
    px: number,
    py: number,
    x1: number | null,
    y1: number | null,
    x2: number | null,
    y2: number | null
  ): boolean | "p1" | "p2" {
    if (x1 === null || y1 === null || x2 === null || y2 === null) {
      return false;
    }

    // Check endpoints first
    const distP1 = this.distance(px, py, x1, y1);
    if (distP1 <= this.tolerance) return "p1";

    const distP2 = this.distance(px, py, x2, y2);
    if (distP2 <= this.tolerance) return "p2";

    // Check line body
    return this.isPointNearLine(px, py, x1, y1, x2, y2);
  }

  private distance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  private isPointNearLine(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;

    if (len2 === 0) return false;

    // Project point onto line segment
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));

    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    const dist = this.distance(px, py, closestX, closestY);
    return dist <= this.tolerance;
  }
}

// ============================================================================
// MAIN CLASS
// ============================================================================

export class TrendLine implements ISeriesPrimitive<Time> {
  _chart: IChartApi;
  _series: ISeriesApi<keyof SeriesOptionsMap>;
  _p1: Point;
  _p2: Point;
  _paneViews: TrendLinePaneView[];
  _options: TrendLineOptions;
  _minPrice: number = 0;
  _maxPrice: number = 0;
  private helper: CoordinateHelper;
  private hitTester: HitTester;

  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    p1: Point,
    p2: Point,
    options?: Partial<TrendLineOptions>
  ) {
    this._chart = chart;
    this._series = series;
    this._p1 = p1;
    this._p2 = p2;
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._paneViews = [new TrendLinePaneView(this)];

    this.helper = new CoordinateHelper(chart, series);
    this.hitTester = new HitTester(8);

    this.updatePriceRange();
  }

  private updatePriceRange() {
    this._minPrice = Math.min(this._p1.price, this._p2.price);
    this._maxPrice = Math.max(this._p1.price, this._p2.price);
  }

  paneViews() {
    return this._paneViews;
  }

  updateAllViews() {
    this._paneViews.forEach((view) => view.update());
  }

  autoscaleInfo(
    startTimePoint: Logical,
    endTimePoint: Logical
  ): AutoscaleInfo | null {
    const p1Index = this.helper.getLogicalIndex(this._p1);
    const p2Index = this.helper.getLogicalIndex(this._p2);

    if (p1Index === null || p2Index === null) return null;
    if (endTimePoint < p1Index || startTimePoint > p2Index) return null;

    return {
      priceRange: {
        minValue: this._minPrice,
        maxValue: this._maxPrice,
      },
    };
  }

  screenPoints(): {
    x1: number | null;
    y1: number | null;
    x2: number | null;
    y2: number | null;
  } {
    return {
      x1: this.helper.getX(this._p1),
      y1: this.helper.getY(this._p1.price),
      x2: this.helper.getX(this._p2),
      y2: this.helper.getY(this._p2.price),
    };
  }

  isHit(px: number, py: number, tolerance = 8): boolean | "p1" | "p2" {
    const { x1, y1, x2, y2 } = this.screenPoints();
    return this.hitTester.test(px, py, x1, y1, x2, y2);
  }

  setP1(pt: Point) {
    this._p1 = pt;
    this.updatePriceRange();
    this.updateAllViews();
  }

  setP2(pt: Point) {
    this._p2 = pt;
    this.updatePriceRange();
    this.updateAllViews();
  }

  updateOptions(opts: Partial<TrendLineOptions>) {
    this._options = { ...this._options, ...opts };
    this.updateAllViews();
  }

  getOptions(): TrendLineOptions {
    return this._options;
  }
}
