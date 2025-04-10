import { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts'
import React from 'react'
import { CirclePrimitive } from '../(plugins)/TrendCircle';
import { TrendLine } from '../(plugins)/TrendLines';

type point = {
    time : UTCTimestamp , 
    price : number
};


function TrendAngle(chartRef : React.RefObject<IChartApi> , candlestickSeriesRef : React.RefObject<ISeriesApi<SeriesType>>) {
    function drawTrendAngle (firstPointRef : point , secondPointRef : point ){
         const p1 = firstPointRef;
                    const { time: x1, price: y1 } = firstPointRef;
                    const { time: x2, price: y2 } = secondPointRef;
                    const p2 = { time: firstPointRef.time + 10 as UTCTimestamp, price: firstPointRef.price };
                    const p3 = secondPointRef;
                    const slope = (y2 - y1) / (x2 - x1);
                    const degree = Math.atan(slope) * (180 / Math.PI);
        
                    const center = firstPointRef;
                    const radius = 30;
                    const circle = new CirclePrimitive(chartRef.current, candlestickSeriesRef.current, center, radius, {
                        strokeStyle: 'red',
                        lineWidth: 2,
                        startAngle:0,
                        endAngle:degree,
                        label: `${Math.floor(degree)}`,
                        labelColor: 'white',
                        labelFont: 'bold 14px Arial',
                        counterClockwise : false
                    });
        
                    chartRef.current.panes()[0].attachPrimitive(circle);
                    const trendAngle = new TrendLine(chartRef.current, candlestickSeriesRef.current, p1, p2, { showLabels: false, lineStyle: 'dashed', lineColor: '#FFEE58' });
                    chartRef.current.panes()[0].attachPrimitive(trendAngle);
                    const trendAngle2 = new TrendLine(chartRef.current, candlestickSeriesRef.current, p1, p3, { showLabels: false });
                    chartRef.current.panes()[0].attachPrimitive(trendAngle2);
    }
  return {drawTrendAngle}
}

export default TrendAngle