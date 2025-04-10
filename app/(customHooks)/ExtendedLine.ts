import { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts'
import React from 'react'
import { TrendLine } from '../(plugins)/TrendLines';

type point ={
    time : UTCTimestamp,
    price : number
}
interface IExtendedLine{
    showLabels?: boolean;
	lineStyle?: string;
	lineColor?: string;
}

function ExtendedLine(chartRef : React.RefObject<IChartApi> , candlestickSeriesRef : React.RefObject<ISeriesApi<SeriesType>>) {
    function drawExtendedLine (firstPointRef : point  , secondPointRef : point , options ?:IExtendedLine){
        const timeScale = chartRef.current.timeScale();
                    const visibleRange = timeScale.getVisibleRange();
                    if (!visibleRange) return;
                    const { time: x1, price: y1 } = firstPointRef;
                    const { time: x2, price: y2 } = secondPointRef;
                    const slope = (y2 - y1) / (x2 - x1);
                    const startTime = visibleRange.from as UTCTimestamp;
                    const featureTime = visibleRange.to as UTCTimestamp;
                    const startPrice = y2 + (slope * (startTime - firstPointRef.time))
                    const featurePrice = y2 + (slope * (featureTime - secondPointRef.time));
                    const p1 = { time: startTime, price: startPrice }
                    const p2 = { time: featureTime, price: featurePrice }
                    const trendLine = new TrendLine(chartRef.current, candlestickSeriesRef.current, p1, p2, { showLabels: options?.showLabels});
                    chartRef.current.panes()[0].attachPrimitive(trendLine);
    }
  return {drawExtendedLine}
}

export default ExtendedLine