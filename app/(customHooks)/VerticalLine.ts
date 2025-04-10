import { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts'
import React from 'react'
import { TrendLine } from '../(plugins)/TrendLines';
// import { TrendLine } from '../(plugins)/TrendLines'

type point = {
    time : UTCTimestamp,
    price : number
}

function VerticalLine(chartRef : React.RefObject<IChartApi> , candlestickSeriesRef : React.RefObject<ISeriesApi<SeriesType>>) {
    function drawVerticalLine(firstPointRef: point) {
        if (!chartRef.current || !candlestickSeriesRef.current) return;
        if (!firstPointRef) return;
    
        const time = firstPointRef.time;    
        const p1 = { time :time, price: firstPointRef.price };
        const p2 = { time :time, price: firstPointRef.price + 2000 };
    
        const trendVertical = new TrendLine(chartRef.current, candlestickSeriesRef.current, p1, p2, {
            lineStyle: 'solid',
            lineColor: 'blue',
            showLabels: false
        });
    
        chartRef.current.panes()[0].attachPrimitive(trendVertical);
    }
    return {drawVerticalLine}
}

export default VerticalLine