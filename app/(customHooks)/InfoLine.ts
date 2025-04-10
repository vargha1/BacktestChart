import { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts'
import React from 'react'
import { TrendLine } from '../(plugins)/TrendLines';

type point = {
    time: UTCTimestamp,
    price: number
}
interface IInfoLine {
    showLabels?: boolean;
    lineStyle?: string;
    lineColor?: string;
}

function InfoLine(chartRef: React.RefObject<IChartApi>, candlestickSeriesRef: React.RefObject<ISeriesApi<SeriesType>>) {

    function drawInfoLine(firstPointRef: point, secondPointRef: point, options?: IInfoLine) {
        const trendLine = new TrendLine(chartRef.current, candlestickSeriesRef.current, firstPointRef, secondPointRef, { showLabels: options?.showLabels });
        chartRef.current.panes()[0].attachPrimitive(trendLine);
    }
    return {drawInfoLine}
}

export default InfoLine