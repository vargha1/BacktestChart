import {
  CanvasRenderingTarget2D,
  BitmapCoordinatesRenderingScope,
} from "fancy-canvas";
import {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
  Coordinate,
  AutoscaleInfo,
} from "lightweight-charts";

interface ViewPoint {
  x: Coordinate | null;
  y: Coordinate | null;
}

interface CircleOptions {
  strokeStyle: string;
  fillStyle?: string;
  lineWidth?: number;
  label?: string;
  labelColor?: string;
  labelFont?: string;
  startAngle?: number;
  endAngle?: number;
  counterClockwise?: boolean;
}

interface Point {
  time: Time;
  price: number;
}

// Renderer: actual drawing logic
class CirclePaneRenderer implements IPrimitivePaneRenderer {
  private _center: ViewPoint;
  private _radius: number;
  private _options: CircleOptions;

  constructor(center: ViewPoint, radius: number, options: CircleOptions) {
    this._center = center;
    this._radius = radius;
    this._options = options;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace(
      (scope: BitmapCoordinatesRenderingScope) => {
        const { x, y } = this._center;
        if (x === null || y === null) return;

        const ctx = scope.context;
        const radiusPx = this._radius * scope.horizontalPixelRatio;

        ctx.beginPath();
        ctx.arc(
          x * scope.horizontalPixelRatio,
          y * scope.verticalPixelRatio,
          radiusPx,
          this._options.startAngle ?? 0,
          this._options.endAngle ?? 2 * Math.PI,
          true
        );

        if (this._options.fillStyle) {
          ctx.fillStyle = this._options.fillStyle;
          ctx.fill();
        }

        ctx.lineWidth = this._options.lineWidth ?? 2;
        ctx.strokeStyle = this._options.strokeStyle;
        ctx.stroke();
        if (this._options.label) {
          const font = this._options.labelFont ?? "13px Arial";
          const labelColor = this._options.labelColor ?? "#FFFFFF";

          ctx.font = font;
          ctx.fillStyle = labelColor;

          // Center of circle in bitmap coords
          const labelX = x * scope.horizontalPixelRatio + 30;
          const labelY = y * scope.verticalPixelRatio - 10;

          // Adjust label position slightly to center text
          const textWidth = ctx.measureText(this._options.label).width;
          ctx.fillText(this._options.label, labelX - textWidth / 2, labelY + 5);
        }
      }
    );
  }
}

// View: prepares coordinates
class CirclePaneView implements IPrimitivePaneView {
  private _source: CirclePrimitive;
  private _center: ViewPoint = { x: null, y: null };

  constructor(source: CirclePrimitive) {
    this._source = source;
  }

  update(): void {
    const timeScale = this._source._chart.timeScale();
    const series = this._source._series;

    const x = timeScale.timeToCoordinate(this._source._center.time);
    const y = series.priceToCoordinate(this._source._center.price);

    this._center = { x, y };
  }

  renderer(): IPrimitivePaneRenderer {
    return new CirclePaneRenderer(
      this._center,
      this._source._radius,
      this._source._options
    );
  }
}

// local interface to include update() (some library versions don't declare it on IPrimitivePaneView)
interface PaneViewWithUpdate extends IPrimitivePaneView {
  update(): void;
}

// Primitive: represents the circle as a chart element
export class CirclePrimitive implements ISeriesPrimitive<Time> {
  _chart: IChartApi;
  _series: ISeriesApi<SeriesType>;
  _center: Point;
  _radius: number;
  _options: CircleOptions;
  private _paneViews: PaneViewWithUpdate[];

  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    center: Point,
    radius: number,
    options: CircleOptions
  ) {
    this._chart = chart;
    this._series = series;
    this._center = center;
    this._radius = radius;
    this._options = options;
    this._paneViews = [new CirclePaneView(this) as PaneViewWithUpdate];
    function degToRad(deg: number): number {
      return (deg * Math.PI) / 180;
    }
    this._options = {
      ...options,
      startAngle:
        options.startAngle !== undefined ? degToRad(options.startAngle) : 0,
      endAngle:
        options.endAngle !== undefined
          ? degToRad(options.endAngle)
          : 2 * Math.PI,
    };
  }

  updateAllViews(): void {
    this._paneViews.forEach((view) => view.update());
  }

  paneViews(): IPrimitivePaneView[] {
    return this._paneViews;
  }

  autoscaleInfo(): AutoscaleInfo | null {
    return null;
  }
}
