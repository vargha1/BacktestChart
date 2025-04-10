'use client';
import React, { useEffect, useRef } from 'react';
import { AreaSeries, BarSeries, CandlestickSeries, ColorType, createChart, CrosshairMode, IChartApi, ISeriesApi, LineSeries, LineStyle, UTCTimestamp } from 'lightweight-charts';
import ApiWebSocket from '@/app/(Api)/ApiWebSocket';
import { useSelector } from '@/app/(store)/SelectedSymbol';
import useTrendLine from '@/app/(customHooks)/UseTrendLine';
import { useChartSeriesStore } from '@/app/(store)/UseChartSeriesStore';

interface DataOhlc {
    time: UTCTimestamp;
    open: number;
    high: number;
    low: number;
    close: number;
}

export default function Chart() {
    const chartContainerRef = useRef<HTMLDivElement | null>(null);
    const allOhlcData = useRef<DataOhlc[]>([]);
    const allLineData = useRef<{ time: UTCTimestamp, value: number }[]>([]);
    const ohlcData = ApiWebSocket();
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const { selectedSymbol } = useSelector();
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const { handleChartClick } = useTrendLine(chartRef, candlestickSeriesRef);
    const { selectedType } = useChartSeriesStore();


    useEffect(() => {
        if (!chartContainerRef.current) return;

        if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
        }

        const chart = createChart(chartContainerRef.current, {
            layout: { textColor: 'white', background: { type: ColorType.Solid, color: '#0F0F0F' } },
            grid: { vertLines: { color: '#444' }, horzLines: { color: '#444' } },
        });

        chart.timeScale().applyOptions({ borderColor: '#6f6464', rightOffset: 2 });
        chart.applyOptions({
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { width: 4, color: '#C3BCDB44', style: LineStyle.Solid, labelBackgroundColor: '#9B7DFF' },
                horzLine: { color: '#9B7DFF', labelBackgroundColor: '#9B7DFF' },
            },
        });

        chartRef.current = chart;

        let newSeries: ISeriesApi<any> | null = null;

        switch (selectedType) {
            case 'line':
                newSeries = chart.addSeries(LineSeries);
                break;
            case 'bar':
                newSeries = chart.addSeries(BarSeries);
                break;
            case 'area':
                newSeries = chart.addSeries(AreaSeries);
                break;
            case 'candlestick':
            default:
                newSeries = chart.addSeries(CandlestickSeries, {
                    upColor: '#26a69a',
                    downColor: '#ef5350',
                    borderVisible: false,
                    wickUpColor: '#26a69a',
                    wickDownColor: '#ef5350',
                });
                break;
        }

        if (newSeries) {
            newSeries.priceScale().applyOptions({
                borderColor: '#6f6464',
                scaleMargins: { top: 0.1, bottom: 0.2 },
            });

            candlestickSeriesRef.current = newSeries;
            chart.timeScale().fitContent();
        }

        // resize handler
        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
                candlestickSeriesRef.current = null;
            }
            window.removeEventListener('resize', handleResize);
        };
    }, [selectedSymbol, selectedType]);


    //trendLine 
    useEffect(() => {
        if (!chartRef.current) return;
        chartRef.current.subscribeClick(handleChartClick);
        return () => chartRef.current?.unsubscribeClick(handleChartClick)
    }, [handleChartClick]);

    //setData & update chart
    // useEffect(() => {
    //     if (ohlcData.length > 0) {
    //         const lastTime = allOhlcData.current.length > 0 ? allOhlcData.current[allOhlcData.current.length - 1].time : 0;
    //         const newData = ohlcData.filter((candle: DataOhlc) => candle.time > lastTime);

    //         allOhlcData.current = [...allOhlcData.current, ...newData];
    //         if (candlestickSeriesRef.current?.seriesType() === 'Candlestick') {
    //             candlestickSeriesRef.current.setData(allOhlcData.current);
    //         } else {
    //             const lineSeriesData = ohlcData.map(item => ({
    //                 time: item.time,
    //                 value: item.close,
    //             }));
    //             candlestickSeriesRef.current?.setData(lineSeriesData)
    //         }
    //     }
    // }, [ohlcData]);
    useEffect(() => {
        if (ohlcData.length > 0) {
            const lastTime = allOhlcData.current.length > 0 ? allOhlcData.current[allOhlcData.current.length - 1].time : 0;
            const newData = ohlcData.filter((candle: DataOhlc) => candle.time > lastTime);

            allOhlcData.current = [...allOhlcData.current, ...newData];

            const newLineData = newData.map(item => ({
                time: item.time,
                value: item.close,
            }));
            allLineData.current = [...allLineData.current, ...newLineData];

            if (candlestickSeriesRef.current?.seriesType() === 'Candlestick') {
                candlestickSeriesRef.current.setData(allOhlcData.current);
            } else {
                candlestickSeriesRef.current?.setData(allLineData.current);
            }
        }
    }, [ohlcData]);


    // useEffect(() => {
    //     if (candlestickSeriesRef.current && allOhlcData.current.length > 0) {
    //         const sortedData = [...allOhlcData.current].sort((a, b) => a.time - b.time);
    //         candlestickSeriesRef.current.setData(sortedData);
    //     }
    // }, [allOhlcData]);
    useEffect(() => {
        if (!candlestickSeriesRef.current) return;

        if (candlestickSeriesRef.current.seriesType() === 'Candlestick') {
            const sortedOhlc = [...allOhlcData.current].sort((a, b) => a.time - b.time);
            candlestickSeriesRef.current.setData(sortedOhlc);
        } else {
            const sortedLine = [...allLineData.current].sort((a, b) => a.time - b.time);
            candlestickSeriesRef.current.setData(sortedLine);
        }
    }, [allOhlcData, allLineData]);


    //toolTip
    useEffect(() => {
        if (!chartRef.current || !candlestickSeriesRef.current) return;

        const toolTip = tooltipRef.current;
        if (!toolTip) return;

        const chart = chartRef.current;
        const series = candlestickSeriesRef.current;
        const container = chartContainerRef.current;
        const toolTipWidth = 100;
        const toolTipHeight = 60;
        const toolTipMargin = 10;

        chart.subscribeCrosshairMove((param: any) => {
            if (!param || !param.time || param.seriesData.size === 0 || !container) {
                toolTip.style.display = 'none';
                return;
            }

            const candlestickData = param.seriesData.get(series);
            if (!candlestickData) return;

            const { open, high, low, close } = candlestickData;

            toolTip.innerHTML = `
                <div>🟢 Open: ${open}</div>
                <div>🔺 High: ${high}</div>
                <div>🔻 Low: ${low}</div>
                <div>🔴 Close: ${close}</div>
            `;

            const coordinate = series.priceToCoordinate(close);
            if (coordinate === null) return;

            let shiftedCoordinate = param.point.x - toolTipWidth / 2;
            shiftedCoordinate = Math.max(0, Math.min(container.clientWidth - toolTipWidth, shiftedCoordinate));

            const coordinateY =
                coordinate - toolTipHeight - toolTipMargin > 0
                    ? coordinate - toolTipHeight - toolTipMargin
                    : Math.max(
                        0,
                        Math.min(container.clientHeight - toolTipHeight - toolTipMargin, coordinate + toolTipMargin)
                    );

            toolTip.style.left = `${shiftedCoordinate}px`;
            toolTip.style.top = `${coordinateY}px`;
            toolTip.style.display = 'block';
        });

        return () => {
            chart.unsubscribeCrosshairMove(() => { });
        };
    }, [allOhlcData]);

    return (
        <div className="relative">
            <div className="bg-[#222]" ref={chartContainerRef} style={{ width: '90vw', height: '95vh' }} />
            <div ref={tooltipRef} className="hidden absolute bg-gray-800  text-white text-xs px-2 py-1 rounded-md border-blue-900 border-2 shadow-md z-40"></div>
        </div>
    );
}
