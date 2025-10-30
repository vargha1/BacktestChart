//BitmapCoordinatesRenderingScope
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

class TrendLinePaneRenderer implements IPrimitivePaneRenderer {
  _p1: ViewPoint;
  _p2: ViewPoint;
  _text1: string;
  _text2: string;
  _options: TrendLineOptions;

  constructor(
    p1: ViewPoint,
    p2: ViewPoint,
    text1: string,
    text2: string,
    options: TrendLineOptions
  ) {
    this._p1 = p1;
    this._p2 = p2;
    this._text1 = text1;
    this._text2 = text2;
    this._options = options;
  }

  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace((scope) => {
      if (
        this._p1.x === null ||
        this._p1.y === null ||
        this._p2.x === null ||
        this._p2.y === null
      )
        return;
      const ctx = scope.context;
      const x1Scaled = Math.round(this._p1.x * scope.horizontalPixelRatio);
      const y1Scaled = Math.round(this._p1.y * scope.verticalPixelRatio);
      const x2Scaled = Math.round(this._p2.x * scope.horizontalPixelRatio);
      const y2Scaled = Math.round(this._p2.y * scope.verticalPixelRatio);
      ctx.lineWidth = this._options.width;
      ctx.strokeStyle = this._options.lineColor;
      if (this._options.lineStyle === "dashed") {
        ctx.setLineDash([10, 3]); // Dash pattern: 10px line, 5px gap
      } else {
        ctx.setLineDash([]); // Solid line
      }
      ctx.beginPath();
      ctx.moveTo(x1Scaled, y1Scaled);
      ctx.lineTo(x2Scaled, y2Scaled);
      ctx.stroke();
      if (this._options.showLabels) {
        const midX = (x1Scaled + x2Scaled) / 2;
        const midY = (y1Scaled + y2Scaled) / 2 - 20;
        const labelText = ``;
        this._drawCenterLabel(scope, labelText, midX, midY);
        // this._drawTextLabel(scope, this._text1, x1Scaled, y1Scaled, true);
        // this._drawTextLabel(scope, this._text2, x2Scaled, y2Scaled, false);
      }
    });
  }
  //label info
  // _drawTextLabel(scope: BitmapCoordinatesRenderingScope, text: string, x: number, y: number, left: boolean) {
  // 	scope.context.font = '24px Arial';
  // 	scope.context.beginPath();
  // 	const offset = 5 * scope.horizontalPixelRatio;
  // 	const textWidth = scope.context.measureText(text);
  // 	const leftAdjustment = left ? textWidth.width + offset * 4 : 0;
  // 	scope.context.fillStyle = this._options.labelBackgroundColor;
  // 	scope.context.roundRect(x + offset - leftAdjustment, y - 24, textWidth.width + offset * 2,  24 + offset, 5);
  // 	scope.context.fill();
  // 	scope.context.beginPath();
  // 	scope.context.fillStyle = this._options.labelTextColor;
  // 	scope.context.fillText(text, x + offset * 2 - leftAdjustment, y);
  // }
  _drawCenterLabel(
    scope: BitmapCoordinatesRenderingScope,
    text: string,
    x: number,
    y: number
  ) {
    scope.context.font = "13px Arial";
    const offset = 5 * scope.horizontalPixelRatio;
    const textWidth = scope.context.measureText(text).width;

    const bgX = x - textWidth / 2 - offset;
    const bgY = y - 24 - offset;
    const bgWidth = textWidth + offset * 2;
    const bgHeight = 24 + offset;

    scope.context.fillStyle = this._options.labelBackgroundColor;
    scope.context.beginPath();
    scope.context.roundRect(bgX, bgY, bgWidth, bgHeight, 5);
    scope.context.fill();

    scope.context.fillStyle = this._options.labelTextColor;
    scope.context.fillText(text, x - textWidth / 2, y - 5);
  }
}

interface ViewPoint {
  x: Coordinate | null;
  y: Coordinate | null;
}

class TrendLinePaneView implements IPrimitivePaneView {
  _source: TrendLine;
  _p1: ViewPoint = { x: null, y: null };
  _p2: ViewPoint = { x: null, y: null };

  constructor(source: TrendLine) {
    this._source = source;
  }

  update() {
    const series = this._source._series;
    const y1 = series.priceToCoordinate(this._source._p1.price);
    const y2 = series.priceToCoordinate(this._source._p2.price);
    const timeScale = this._source._chart.timeScale();
    const x1 =
      typeof this._source._p1.logical === "number"
        ? timeScale.logicalToCoordinate(this._source._p1.logical as Logical)
        : timeScale.timeToCoordinate(this._source._p1.time);
    const x2 =
      typeof this._source._p2.logical === "number"
        ? timeScale.logicalToCoordinate(this._source._p2.logical as Logical)
        : timeScale.timeToCoordinate(this._source._p2.time);
    this._p1 = { x: x1, y: y1 };
    this._p2 = { x: x2, y: y2 };
  }

  renderer() {
    return new TrendLinePaneRenderer(
      this._p1,
      this._p2,
      "" + this._source._p1.price.toFixed(1),
      "" + this._source._p2.price.toFixed(1),
      this._source._options
    );
  }
}

interface Point {
  time: Time;
  price: number;
  logical?: number; // optional logical index for out-of-range placement
}

export interface TrendLineOptions {
  lineColor: string;
  width: number;
  showLabels: boolean;
  labelBackgroundColor: string;
  labelTextColor: string;
  lineStyle: "solid" | "dashed";
}

const defaultOptions: TrendLineOptions = {
  lineColor: "#FFFFFF",
  width: 3,
  showLabels: true,
  labelBackgroundColor: "#404040",
  labelTextColor: "#FFFFFF",
  lineStyle: "solid",
};

export class TrendLine implements ISeriesPrimitive<Time> {
  _chart: IChartApi;
  _series: ISeriesApi<keyof SeriesOptionsMap>;
  _p1: Point;
  _p2: Point;
  _paneViews: TrendLinePaneView[];
  _options: TrendLineOptions;
  _minPrice: number;
  _maxPrice: number;

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
    this._minPrice = Math.min(this._p1.price, this._p2.price);
    this._maxPrice = Math.max(this._p1.price, this._p2.price);
    this._options = {
      ...defaultOptions,
      ...options,
    };
    this._paneViews = [new TrendLinePaneView(this)];
  }

  autoscaleInfo(
    startTimePoint: Logical,
    endTimePoint: Logical
  ): AutoscaleInfo | null {
    const p1Index = this._pointIndex(this._p1);
    const p2Index = this._pointIndex(this._p2);
    if (p1Index === null || p2Index === null) return null;
    if (endTimePoint < p1Index || startTimePoint > p2Index) return null;
    return {
      priceRange: {
        minValue: this._minPrice,
        maxValue: this._maxPrice,
      },
    };
  }

  updateAllViews() {
    this._paneViews.forEach((pw) => pw.update());
  }

  paneViews() {
    return this._paneViews;
  }

  _pointIndex(p: Point): number | null {
    const ts = this._chart.timeScale();
    const coordinate =
      typeof p.logical === "number"
        ? ts.logicalToCoordinate(p.logical as Logical)
        : ts.timeToCoordinate(p.time);
    if (coordinate === null) return null;
    const index = ts.coordinateToLogical(coordinate);
    return index;
  }

  // Compute current screen coordinates of the two points
  screenPoints(): {
    x1: number | null;
    y1: number | null;
    x2: number | null;
    y2: number | null;
  } {
    const y1 = this._series.priceToCoordinate(this._p1.price);
    const y2 = this._series.priceToCoordinate(this._p2.price);
    const ts = this._chart.timeScale();
    const x1 =
      typeof this._p1.logical === "number"
        ? ts.logicalToCoordinate(this._p1.logical as Logical)
        : ts.timeToCoordinate(this._p1.time as any);
    const x2 =
      typeof this._p2.logical === "number"
        ? ts.logicalToCoordinate(this._p2.logical as Logical)
        : ts.timeToCoordinate(this._p2.time as any);
    return { x1, y1, x2, y2 };
  }

  // Simple hit test: distance from point to line segment <= tolerance pixels
  isHit(px: number, py: number, tolerance = 8): boolean | "p1" | "p2" {
    const { x1, y1, x2, y2 } = this.screenPoints();
    if (x1 === null || y1 === null || x2 === null || y2 === null) return false;

    // check endpoints first (p1)
    const distP1 = Math.hypot(px - x1, py - y1);
    if (distP1 <= tolerance) return "p1";
    const distP2 = Math.hypot(px - x2, py - y2);
    if (distP2 <= tolerance) return "p2";

    // then check body
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return false;
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    const dist = Math.hypot(px - cx, py - cy);
    return dist <= tolerance;
  }

  // allow external move of endpoints
  setP1(pt: Point) {
    this._p1 = pt;
    this._minPrice = Math.min(this._p1.price, this._p2.price);
    this._maxPrice = Math.max(this._p1.price, this._p2.price);
    this.updateAllViews();
  }

  setP2(pt: Point) {
    this._p2 = pt;
    this._minPrice = Math.min(this._p1.price, this._p2.price);
    this._maxPrice = Math.max(this._p1.price, this._p2.price);
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
