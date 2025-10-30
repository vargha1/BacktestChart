import { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from "lightweight-charts";
import React from "react";
import { TrendLine } from "../(plugins)/TrendLines";

type point = {
    time : UTCTimestamp , 
    price : number
};

interface rayLine {
    showLabels?: boolean;
	lineStyle?: string;
	lineColor?: string;
}

function RayLine(chartRef : React.RefObject<IChartApi> , candlestickSeriesRef : React.RefObject<ISeriesApi<SeriesType>>) {

    function drawRayLine (firstPointRef : point , secondPointRef : point , options?:rayLine): TrendLine | null {
        const timeScale = chartRef.current.timeScale();
        const visibleRange = timeScale.getVisibleRange();
        if (!visibleRange) return null;
        const { time: x1, price: y1 } = firstPointRef;
        const { time: x2, price: y2 } = secondPointRef;
        const slope = (y2 - y1) / (x2 - x1);
        const featureTime = visibleRange.to as UTCTimestamp;
        const featurePrice = y2 + (slope * (featureTime - secondPointRef.time))
        const point2 = { time: featureTime, price: featurePrice };

        const trendLine = new TrendLine(chartRef.current, candlestickSeriesRef.current, firstPointRef, point2, { showLabels: options?.showLabels  });
        chartRef.current.panes()[0].attachPrimitive(trendLine);
        return trendLine;
    }

    return {drawRayLine}
}

export default RayLine