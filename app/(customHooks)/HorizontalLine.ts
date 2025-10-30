import {
  IChartApi,
  ISeriesApi,
  SeriesType,
  UTCTimestamp,
} from "lightweight-charts";
import React from "react";
import { TrendLine } from "../(plugins)/TrendLines";

function HorizontalLine(
  chartRef: React.RefObject<IChartApi>,
  candlestickSeriesRef: React.RefObject<ISeriesApi<SeriesType>>,
  infiniteLineRef: React.RefObject<TrendLine>
) {
  const drawDynamicHorizontalLine = (price: number): TrendLine | null => {
    if (!chartRef.current || !candlestickSeriesRef.current) return null;

    const timeScale = chartRef.current.timeScale();

    const updateLine = (): TrendLine | null => {
      const visibleRange = timeScale.getVisibleRange();
      if (!visibleRange) return null;

      const { from, to } = visibleRange;

      const p1 = { time: from as UTCTimestamp, price };
      const p2 = { time: to as UTCTimestamp, price };

      if (infiniteLineRef.current) {
        chartRef.current.panes()[0].detachPrimitive(infiniteLineRef.current);
      }

      const trendLine = new TrendLine(
        chartRef.current,
        candlestickSeriesRef.current,
        p1,
        p2,
        {
          showLabels: false,
          lineStyle: "solid",
        }
      );

      chartRef.current.panes()[0].attachPrimitive(trendLine);
      infiniteLineRef.current = trendLine;
      return trendLine;
    };

    const created = updateLine();

    timeScale.subscribeVisibleLogicalRangeChange(updateLine);
    return created ? created : null;
  };

  return { drawDynamicHorizontalLine };
}

export default HorizontalLine;
