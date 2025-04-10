import { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts'
import React from 'react'
import { TrendLine } from '../(plugins)/TrendLines'


function HorizontalLine(chartRef: React.RefObject<IChartApi> , candlestickSeriesRef: React.RefObject<ISeriesApi<SeriesType>> , infiniteLineRef : React.RefObject<TrendLine>) {
    const drawDynamicHorizontalLine = (price: number) => {
        if (!chartRef.current || !candlestickSeriesRef.current) return;
    
        const timeScale = chartRef.current.timeScale();
    
        const updateLine = () => {
            const visibleRange = timeScale.getVisibleRange();
            if (!visibleRange) return;
    
            const { from, to } = visibleRange;
    
            const p1 = { time: from as UTCTimestamp, price };
            const p2 = { time: to as UTCTimestamp, price };
    
            if (infiniteLineRef.current) {
                chartRef.current.panes()[0].detachPrimitive(infiniteLineRef.current);
            }
    
            const trendLine = new TrendLine(chartRef.current, candlestickSeriesRef.current, p1, p2, {
                showLabels: false,
                lineStyle: 'solid',
            });
    
            chartRef.current.panes()[0].attachPrimitive(trendLine);
            infiniteLineRef.current = trendLine;
        };
    
        updateLine();
    
    
        timeScale.subscribeVisibleLogicalRangeChange(updateLine);
    };
    

    return { drawDynamicHorizontalLine }
}

export default HorizontalLine