import React, { useRef } from "react";
import { IChartApi, ISeriesApi, MouseEventParams, UTCTimestamp } from "lightweight-charts";
import { SelectedTools } from "../(store)/SelectedTools";
import { TrendLine } from "../(plugins)/TrendLines";
import UseTrendLineFn from "./TrendLine";
import RayLine from "./RayLine";
import InfoLine from "./InfoLine";
import ExtendedLine from "./ExtendedLine";
import TrendAngle from "./TrendAngle";
import HorizontalLine from "./HorizontalLine";
import VerticalLine from "./VerticalLine";

interface Point {
    time: UTCTimestamp;
    price: number;
}

export default function useTrendLine(
    chartRef: React.RefObject<IChartApi>,
    candlestickSeriesRef: React.RefObject<ISeriesApi<"Candlestick">>
) {
    const firstPointRef = useRef<Point | null>(null);
    const secondPointRef = useRef<Point | null>(null);
    const tempLineRef = useRef<TrendLine | null>(null);
    const infiniteLineRef = useRef<TrendLine | null>(null);
    const { objectSelected, setTools } = SelectedTools();
    const { drawLine } = UseTrendLineFn(chartRef, candlestickSeriesRef);
    const { drawRayLine } = RayLine(chartRef, candlestickSeriesRef);
    const { drawInfoLine } = InfoLine(chartRef, candlestickSeriesRef);
    const { drawExtendedLine } = ExtendedLine(chartRef, candlestickSeriesRef);
    const { drawTrendAngle } = TrendAngle(chartRef, candlestickSeriesRef);
    const {drawDynamicHorizontalLine}= HorizontalLine(chartRef , candlestickSeriesRef ,infiniteLineRef);
    const {drawVerticalLine} = VerticalLine(chartRef , candlestickSeriesRef);


    const handleChartClick = (param: MouseEventParams) => {
        if (!objectSelected.isSelected) return;
        if (!param || !param.point || !param.time) return;

        const time = param.time as UTCTimestamp;
        const price = candlestickSeriesRef.current.coordinateToPrice(param.point.y);

        if (time && price) {
            if (!firstPointRef.current) {
                firstPointRef.current = { time, price };
                attachMouseMoveListener();
                if (objectSelected.title === 'Horizontal Line') {
                    drawDynamicHorizontalLine(firstPointRef.current.price);
                };
                if (objectSelected.title === 'Vertical Line') {
                    drawVerticalLine(firstPointRef.current);
                }
            } else if (!secondPointRef.current) {
                secondPointRef.current = { time, price };
                drawTrendLine();
                detachMouseMoveListener();
                setTools({ title: 'trendLineTools', isSelected: false })
            }
        }
    };

    const drawTrendLine = () => {
        if (!chartRef.current || !candlestickSeriesRef.current) return;

        if (!firstPointRef.current || !secondPointRef.current) return;

        if (objectSelected.title === 'Trend Line') {
            drawLine(firstPointRef.current, secondPointRef.current, { showLabels: false })
        }
        if (objectSelected.title === 'Ray') {
            drawRayLine(firstPointRef.current, secondPointRef.current, { showLabels: false })
        }
        if (objectSelected.title === 'Info Line') {
            drawInfoLine(firstPointRef.current, secondPointRef.current, { showLabels: true })
        }
        if (objectSelected.title === 'Extended Line') {
            drawExtendedLine(firstPointRef.current, secondPointRef.current, { showLabels: false })
        }
        if (objectSelected.title === 'Trend Angle') {
            drawTrendAngle(firstPointRef.current, secondPointRef.current)
        }
       

        if (tempLineRef.current) {
            chartRef.current.panes()[0].detachPrimitive(tempLineRef.current);
            tempLineRef.current = null;
        }

        firstPointRef.current = null;
        secondPointRef.current = null;
    };
    
    const handleMouseMove = (param: MouseEventParams) => {
        if (!chartRef.current || !candlestickSeriesRef.current) return;
        if (!firstPointRef.current || !param.point || !param.time) return;

        const time = param.time as UTCTimestamp;
        const price = candlestickSeriesRef.current.coordinateToPrice(param.point.y);
        if (!price) return;

        if (tempLineRef.current) {
            chartRef.current.panes()[0].detachPrimitive(tempLineRef.current);
        }

        tempLineRef.current = new TrendLine(chartRef.current, candlestickSeriesRef.current, firstPointRef.current, { time, price }, { showLabels: false });
        chartRef.current.panes()[0].attachPrimitive(tempLineRef.current);
    };

    const attachMouseMoveListener = () => {
        if (!chartRef.current) return;
        chartRef.current.subscribeCrosshairMove(handleMouseMove);
    };

    const detachMouseMoveListener = () => {
        if (!chartRef.current) return;
        chartRef.current.unsubscribeCrosshairMove(handleMouseMove);
    };

    return { handleChartClick, drawTrendLine };
}
