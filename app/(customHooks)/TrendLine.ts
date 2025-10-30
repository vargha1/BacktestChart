import {
  IChartApi,
  ISeriesApi,
  SeriesType,
  UTCTimestamp,
} from "lightweight-charts";
import React from "react";
import { TrendLine } from "../(plugins)/TrendLines";

type point = {
  time: UTCTimestamp;
  price: number;
};

interface ILineOptions {
  showLabels?: boolean;
  lineStyle?: string;
  lineColor?: string;
}

function UseTrendLineFn(
  chartRef: React.RefObject<IChartApi> | null,
  candleStickSeriesRef: React.RefObject<ISeriesApi<SeriesType>> | null
) {
  function drawLine(
    firstPointRef: point,
    secondPointRef: point,
    options?: ILineOptions
  ) {
    if (!chartRef || !chartRef.current) return;
    if (!candleStickSeriesRef || !candleStickSeriesRef.current) return;
    const trendLine = new TrendLine(
      chartRef.current,
      candleStickSeriesRef.current,
      firstPointRef,
      secondPointRef,
      {
        showLabels: options?.showLabels ?? false,
      }
    );
    chartRef.current.panes()[0].attachPrimitive(trendLine);
  }
  return { drawLine };
}

export default UseTrendLineFn;
