// Updated Chart component
// Changes:
// - Pass chartContainerRef and intervalSeconds to useTrendLine
// - No other major changes needed here, but ensure all refs are handled correctly

"use client";
import React, { useEffect, useRef } from "react";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  CandlestickData,
  ColorType,
  createChart,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  IRange,
  Time,
  LineSeries,
  SingleValueData,
  LineStyle,
  UTCTimestamp,
} from "lightweight-charts";
import ApiWebSocket from "@/app/(Api)/ApiWebSocket";
import { useSelector } from "@/app/(store)/SelectedSymbol";
import useTrendLine from "@/app/(customHooks)/UseTrendLine";
import { useChartSeriesStore } from "@/app/(store)/UseChartSeriesStore";
import useSelectedTimeframe from "@/app/(store)/SelectedTimeframe";
import { SelectedTools } from "@/app/(store)/SelectedTools";

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
  const allLineData = useRef<{ time: UTCTimestamp; value: number }[]>([]);
  const {
    ohlcData,
    connectionStatus,
    loadMoreBefore,
    intervalSeconds,
    isLoadingHistory,
  } = ApiWebSocket();
  const { objectSelected } = SelectedTools();
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<
    "Candlestick" | "Line" | "Area" | "Bar"
  > | null>(null);
  const { selectedSymbol } = useSelector();
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const earliestLoadedRef = useRef<number | null>(null);
  const lastFetchBeforeRef = useRef<number | null>(null);
  const isLoadingMoreRef = useRef(false);
  // keep latest API values in refs so chart setup effect doesn't depend on changing function identities
  const loadMoreBeforeRef = useRef(loadMoreBefore);
  const intervalSecondsRef = useRef(intervalSeconds);
  const isLoadingHistoryRef = useRef(isLoadingHistory);
  // pass non-null refs to the hook (hook should handle nullable refs internally)
  const {
    handleChartClick,
    updateSelectedLineStyle,
    deleteSelectedLine,
    getSelectedLineMidpoint,
    selectedLineRef,
    selectionTick,
    saveDrawings,
    bumpSelectionTick,
    loadDrawings,
    notifyNewBar,
  } = useTrendLine(
    chartRef as unknown as React.RefObject<IChartApi>,
    candlestickSeriesRef as unknown as React.RefObject<
      ISeriesApi<"Candlestick">
    >,
    chartContainerRef, // NEW: Pass container ref for mouse event listeners
    intervalSeconds // NEW: Pass intervalSeconds for time deltas in dragging vertical lines
  );
  const { timeframe } = useSelectedTimeframe();
  const { selectedType } = useChartSeriesStore();
  const [lineToolbarPos, setLineToolbarPos] = React.useState<{
    x: number;
    y: number;
  } | null>(null);
  const [lineWidth, setLineWidth] = React.useState<number>(3);
  const [lineColor, setLineColor] = React.useState<string>("#FFFFFF");
  // edit panel state for selected primitive
  const [editState, setEditState] = React.useState<any>(null);

  useEffect(() => {
    loadMoreBeforeRef.current = loadMoreBefore;
  }, [loadMoreBefore]);

  useEffect(() => {
    intervalSecondsRef.current = intervalSeconds;
  }, [intervalSeconds]);

  useEffect(() => {
    isLoadingHistoryRef.current = isLoadingHistory;
    // toggle chart interaction while loading history
    if (chartRef.current) {
      chartRef.current.applyOptions({
        handleScale: isLoadingHistory ? false : true,
        handleScroll: isLoadingHistory ? false : true,
      });
    }
  }, [isLoadingHistory]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        textColor: "white",
        background: { type: ColorType.Solid, color: "#0F0F0F" },
      },
      grid: { vertLines: { color: "#444" }, horzLines: { color: "#444" } },
    });

    chart.timeScale().applyOptions({ borderColor: "#6f6464", rightOffset: 2 });
    chart.applyOptions({
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 4,
          color: "#C3BCDB44",
          style: LineStyle.Solid,
          labelBackgroundColor: "#9B7DFF",
        },
        horzLine: { color: "#9B7DFF", labelBackgroundColor: "#9B7DFF" },
      },
    });

    chartRef.current = chart;

    let newSeries: ISeriesApi<"Area" | "Bar" | "Line" | "Candlestick"> | null =
      null;

    switch (selectedType) {
      case "line":
        newSeries = chart.addSeries(LineSeries);
        break;
      case "bar":
        newSeries = chart.addSeries(BarSeries);
        break;
      case "area":
        newSeries = chart.addSeries(AreaSeries);
        break;
      case "candlestick":
      default:
        newSeries = chart.addSeries(CandlestickSeries);
        break;
    }

    if (newSeries) {
      newSeries.priceScale().applyOptions({
        borderColor: "#6f6464",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      });

      candlestickSeriesRef.current = newSeries;
      chart.timeScale().fitContent();
      // load persisted drawings after series is available
      try {
        loadDrawings?.();
      } catch (err) {
        // ignore errors from loading drawings
        // eslint-disable-next-line no-console
        console.warn("failed to load drawings on chart init", err);
      }
    }

    // subscribe to visible range changes to implement lazy-loading of history
    let visibleCallback: ((range: IRange<Time> | null) => void) | null = null;
    try {
      let noMoreUntil = 0;
      visibleCallback = (range: IRange<Time> | null) => {
        // ignore events while history is loading
        if (isLoadingHistoryRef.current) return;
        if (!range) return;
        const now = Date.now();
        if (now < noMoreUntil) return; // cooldown active

        // when user pans near the left edge, request older data
        const from = range.from as unknown as number;
        if (!Number.isFinite(from)) return;
        const earliest =
          earliestLoadedRef.current ?? allOhlcData.current[0]?.time;
        if (!earliest) return;
        // debug
        // eslint-disable-next-line no-console
        // console.debug("visibleRangeChange", {
        //   from,
        //   earliest,
        //   count: allOhlcData.current.length,
        // });
        // avoid refetching the same 'before' time repeatedly
        // avoid refetching exactly the same 'before' time repeatedly
        if (
          lastFetchBeforeRef.current &&
          lastFetchBeforeRef.current === earliest
        )
          return;

        // if visible from is within N intervals of earliest point, load more
        const marginIntervals = 30; // fetch when within 30 candles
        const threshold =
          earliest + (intervalSecondsRef.current || 60) * marginIntervals;
        if (from <= threshold) {
          if (isLoadingMoreRef.current) return;
          // set a short cooldown immediately to prevent multiple scheduled calls
          noMoreUntil = Date.now() + 2000;
          isLoadingMoreRef.current = true;
          const beforeTime = earliest;
          // call loadMoreBefore and await result
          (async () => {
            try {
              // eslint-disable-next-line no-console
              console.debug("loadMoreBefore: request", {
                beforeTime,
                limit: 5000,
              });
              const fetched = await loadMoreBeforeRef.current(beforeTime, 5000);
              // eslint-disable-next-line no-console
              console.debug("loadMoreBefore: result", { fetched });
              // remember we requested before this time so we don't request it again
              lastFetchBeforeRef.current = beforeTime;
              if (!fetched) {
                // if no data was fetched, extend cooldown a bit
                noMoreUntil = Date.now() + 2000;
              } else {
                // if we fetched more, give a slightly longer cooldown to allow chart to stabilize
                noMoreUntil = Date.now() + 3000;
              }
            } catch {
              noMoreUntil = Date.now() + 2000;
            } finally {
              isLoadingMoreRef.current = false;
            }
          })();
        }
      };
      chart.timeScale().subscribeVisibleTimeRangeChange(visibleCallback);
    } catch {
      // subscribe may fail silently on some versions; ignore
    }

    // resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candlestickSeriesRef.current = null;
      }
      window.removeEventListener("resize", handleResize);
      if (visibleCallback)
        chart.timeScale().unsubscribeVisibleTimeRangeChange(visibleCallback);
    };
  }, [selectedSymbol, selectedType]);

  // when timeframe changes, clear internal buffers so chart reloads historical data
  useEffect(() => {
    allOhlcData.current = [];
    allLineData.current = [];
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData(
        [] as unknown as Array<{
          time: UTCTimestamp;
          open?: number;
          high?: number;
          low?: number;
          close?: number;
          value?: number;
        }>
      );
    }
  }, [timeframe]);

  //trendLine
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.subscribeClick(handleChartClick);
    return () => chartRef.current?.unsubscribeClick(handleChartClick);
  }, [handleChartClick]);

  // keep toolbar aligned with selected line midpoint
  useEffect(() => {
    const updatePos = () => {
      const mid = getSelectedLineMidpoint();
      setLineToolbarPos(mid);
    };
    updatePos();
    // also update when visible range changes
    let unsub: (() => void) | null = null;
    if (chartRef.current) {
      const cb = () => updatePos();
      chartRef.current.timeScale().subscribeVisibleTimeRangeChange(cb as any);
      unsub = () =>
        chartRef.current
          ?.timeScale()
          .unsubscribeVisibleTimeRangeChange(cb as any);
    }
    window.addEventListener("resize", updatePos);
    return () => {
      if (unsub) unsub();
      window.removeEventListener("resize", updatePos);
    };
  }, [
    // selectedLineRef,
    selectionTick,
    allOhlcData.current.length,
    allLineData.current.length,
  ]);

  // sync edit panel inputs when selection changes
  useEffect(() => {
    const sel = selectedLineRef.current;
    if (!sel) {
      setEditState(null);
      return;
    }

    // PositionTool: has _entry, _tp, _sl and setTp/setSl
    if (sel.setTp && sel.setSl && sel._entry) {
      setEditState({
        kind: "position",
        entryPrice: sel._entry.price,
        tp: sel._tp,
        sl: sel._sl,
        side: sel._options?.side ?? "long",
        bandWidth: sel._options?.bandWidth ?? sel._options?.width ?? 120,
      });
      return;
    }

    // TrendLine-like: has _p1/_p2
    if (sel._p1 && sel._p2) {
      setEditState({
        kind: "trend",
        p1price: sel._p1.price,
        p2price: sel._p2.price,
        color:
          sel.getOptions?.()?.lineColor ?? sel._options?.lineColor ?? "#FFFFFF",
        width: sel.getOptions?.()?.width ?? sel._options?.width ?? 2,
      });
      return;
    }

    // fallback
    setEditState(null);
  }, [selectionTick]);

  //setData & update chart
  useEffect(() => {
    // ohlcData comes from the ApiWebSocket hook and is an array
    if (!ohlcData || ohlcData.length === 0) return;
    // debug trace
    // eslint-disable-next-line no-console
    console.debug("Chart: received ohlcData", {
      incoming: ohlcData.length,
      current: allOhlcData.current.length,
    });

    // If we haven't populated local buffer yet, just use the whole payload
    if (allOhlcData.current.length === 0) {
      // initial population
      // eslint-disable-next-line no-console
      console.debug("Chart: initial setData with payload", {
        first: ohlcData[0]?.time,
        last: ohlcData[ohlcData.length - 1]?.time,
      });
      allOhlcData.current = [...ohlcData];
      allLineData.current = allOhlcData.current.map((d) => ({
        time: d.time,
        value: d.close,
      }));
      // record earliest loaded candle
      earliestLoadedRef.current = allOhlcData.current[0]?.time ?? null;
      if (!candlestickSeriesRef.current) return;
      if (candlestickSeriesRef.current.seriesType() === "Candlestick") {
        // initial full set
        const sorted = [...allOhlcData.current].sort((a, b) => a.time - b.time);
        candlestickSeriesRef.current.setData(sorted);
        // notify primitives about initial bars
        for (const bar of sorted) {
          // compute logical index for the bar to help primitives pinpoint candle X precisely
          let logical: number | undefined = undefined;
          try {
            const ts = chartRef.current!.timeScale();
            const cx = ts.timeToCoordinate(bar.time as any);
            if (typeof cx === "number") {
              const lg = ts.coordinateToLogical(cx as any);
              if (typeof lg === "number") logical = lg;
            }
          } catch {}
          notifyNewBar?.({
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            time: bar.time,
            logical,
          } as any);
        }
        // Dev helper: if running on localhost, after a short delay emit a synthetic bar
        // that will hit the first PositionTool found (useful to reproduce hit logic).
        try {
          if (
            typeof window !== "undefined" &&
            window.location.hostname === "localhost"
          ) {
            setTimeout(() => {
              try {
                // Find a position tool in chart primitives
                const sel = selectedLineRef.current as any;
                if (sel && sel._kind === "position") {
                  const tp = sel._tp;
                  const entry = sel._entry?.price ?? 0;
                  const fakeTime = sorted[sorted.length - 1]?.time + 60;
                  const fakeBar = {
                    open: entry,
                    high: Math.max(tp, entry + 1),
                    low: entry - 1,
                    close: entry,
                    time: fakeTime,
                  };
                  notifyNewBar?.(fakeBar as any);
                  // eslint-disable-next-line no-console
                  console.debug(
                    "Dev: emitted synthetic bar to hit position (selectedLineRef)",
                    { fakeBar }
                  );
                }
              } catch (e) {}
            }, 2000);
          }
        } catch {}
      } else {
        const sorted = [...allLineData.current].sort((a, b) => a.time - b.time);
        candlestickSeriesRef.current.setData(sorted);
      }
      return;
    }

    // detect if the incoming ohlcData contains older candles (prepend case)
    const incomingFirst = ohlcData[0]?.time;
    const currentFirst = allOhlcData.current[0]?.time;
    if (incomingFirst && currentFirst && incomingFirst < currentFirst) {
      // prepend case: update full buffer with incoming data and remember we fetched before this time
      // eslint-disable-next-line no-console
      console.debug("Chart: prepend detected", {
        incomingFirst,
        currentFirst,
        incomingCount: ohlcData.length,
      });
      allOhlcData.current = [...ohlcData];
      allLineData.current = allOhlcData.current.map((d) => ({
        time: d.time,
        value: d.close,
      }));
      earliestLoadedRef.current = allOhlcData.current[0]?.time ?? null;
      if (!candlestickSeriesRef.current) return;
      if (candlestickSeriesRef.current.seriesType() === "Candlestick") {
        const sorted = [...allOhlcData.current].sort((a, b) => a.time - b.time);
        candlestickSeriesRef.current.setData(sorted);
        for (const bar of sorted) {
          notifyNewBar?.({
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            time: bar.time,
          });
        }
      } else {
        const sorted = [...allLineData.current].sort((a, b) => a.time - b.time);
        candlestickSeriesRef.current.setData(sorted);
      }
      return;
    }

    // handle replace-last (websocket updates the active candle) before append
    const incomingLast = ohlcData[ohlcData.length - 1];
    const currentLast = allOhlcData.current[allOhlcData.current.length - 1];
    if (incomingLast && currentLast && incomingLast.time === currentLast.time) {
      // update last candle if it changed
      if (
        incomingLast.close !== currentLast.close ||
        incomingLast.open !== currentLast.open ||
        incomingLast.high !== currentLast.high ||
        incomingLast.low !== currentLast.low
      ) {
        // eslint-disable-next-line no-console
        console.debug("Chart: replace-last branch", {
          time: incomingLast.time,
        });
        allOhlcData.current[allOhlcData.current.length - 1] = incomingLast;
        allLineData.current[allLineData.current.length - 1] = {
          time: incomingLast.time,
          value: incomingLast.close,
        };
        if (candlestickSeriesRef.current) {
          if (candlestickSeriesRef.current.seriesType() === "Candlestick") {
            (candlestickSeriesRef.current as ISeriesApi<"Candlestick">).update(
              incomingLast as unknown as CandlestickData
            );
            // notify primitives about updated bar
            let logicalReplace: number | undefined = undefined;
            try {
              const ts = chartRef.current!.timeScale();
              const cx = ts.timeToCoordinate(incomingLast.time as any);
              if (typeof cx === "number") {
                const lg = ts.coordinateToLogical(cx as any);
                if (typeof lg === "number") logicalReplace = lg;
              }
            } catch {}
            notifyNewBar?.({
              open: incomingLast.open,
              high: incomingLast.high,
              low: incomingLast.low,
              close: incomingLast.close,
              time: incomingLast.time,
              logical: logicalReplace,
            } as any);
          } else {
            (candlestickSeriesRef.current as ISeriesApi<"Line">).update({
              time: incomingLast.time,
              value: incomingLast.close,
            } as unknown as SingleValueData);
          }
        }
      }
      return;
    }

    // append only newer points with series.update to preserve the visible window
    const lastTime = allOhlcData.current[allOhlcData.current.length - 1].time;
    const newData = ohlcData.filter(
      (candle: DataOhlc) => candle.time > lastTime
    );
    if (newData.length === 0) {
      // eslint-disable-next-line no-console
      console.debug("Chart: no new data to append");
      return;
    }
    // eslint-disable-next-line no-console
    console.debug("Chart: append branch", {
      newCount: newData.length,
      lastTime,
    });
    allOhlcData.current = [...allOhlcData.current, ...newData];
    // keep earliest reference accurate
    if (allOhlcData.current.length > 0) {
      earliestLoadedRef.current = allOhlcData.current[0].time;
    }
    allLineData.current = [
      ...allLineData.current,
      ...newData.map((d: DataOhlc) => ({ time: d.time, value: d.close })),
    ];

    if (!candlestickSeriesRef.current) return;
    // lightweight-charts supports incremental updates via series.update for newer points
    for (const d of newData) {
      if (candlestickSeriesRef.current.seriesType() === "Candlestick") {
        const payload = d as unknown as CandlestickData;
        (candlestickSeriesRef.current as ISeriesApi<"Candlestick">).update(
          payload
        );
        let logicalAppend: number | undefined = undefined;
        try {
          const ts = chartRef.current?.timeScale()!;
          const cx = ts.timeToCoordinate(d.time as any);
          if (typeof cx === "number") {
            const lg = ts.coordinateToLogical(cx as any);
            if (typeof lg === "number") logicalAppend = lg;
          }
        } catch {}
        notifyNewBar?.({
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          time: d.time,
          logical: logicalAppend,
        } as any);
      } else {
        const payload = {
          time: d.time,
          value: d.close,
        } as unknown as SingleValueData;
        (candlestickSeriesRef.current as ISeriesApi<"Line">).update(payload);
      }
    }
  }, [ohlcData]);

  useEffect(() => {
    if (!candlestickSeriesRef.current) return;

    if (candlestickSeriesRef.current.seriesType() === "Candlestick") {
      const sortedOhlc = [...allOhlcData.current].sort(
        (a, b) => a.time - b.time
      );
      candlestickSeriesRef.current.setData(sortedOhlc);
    } else {
      const sortedLine = [...allLineData.current].sort(
        (a, b) => a.time - b.time
      );
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

    function handleCrosshair(param: unknown) {
      const toolTip = tooltipRef.current;
      if (!toolTip) return;
      // hide tooltip while drawing tools are active
      if (objectSelected && objectSelected.isSelected) {
        toolTip.style.display = "none";
        return;
      }

      if (!param || !container) {
        toolTip.style.display = "none";
        return;
      }

      const asParam = param as {
        seriesData?: Map<
          ISeriesApi<"Candlestick" | "Line" | "Area" | "Bar">,
          unknown
        >;
        point?: { x: number; y: number };
        time?: unknown;
      };
      const seriesDataRaw = asParam.seriesData
        ? asParam.seriesData.get(
            series as ISeriesApi<"Candlestick" | "Line" | "Area" | "Bar">
          )
        : undefined;
      const seriesData = seriesDataRaw as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      if (!seriesData) {
        toolTip.style.display = "none";
        return;
      }

      // ensure point exists and is within plotting area (not above/below)
      if (!asParam.point) {
        toolTip.style.display = "none";
        return;
      }

      // only show tooltip when hovering vertically within the candle's high-low range
      const yHigh = series.priceToCoordinate(seriesData.high);
      const yLow = series.priceToCoordinate(seriesData.low);
      if (yHigh == null || yLow == null) {
        toolTip.style.display = "none";
        return;
      }
      const yMin = Math.min(yHigh, yLow);
      const yMax = Math.max(yHigh, yLow);
      const mouseY = asParam.point.y;
      // small tolerance in pixels to avoid flicker at exact bounds
      const tolerancePx = 1.5;
      if (mouseY < yMin - tolerancePx || mouseY > yMax + tolerancePx) {
        toolTip.style.display = "none";
        return;
      }

      const { open, high, low, close } = seriesData;

      toolTip.innerHTML = `
                <div>🟢 Open: ${open}</div>
                <div>🔺 High: ${high}</div>
                <div>🔻 Low: ${low}</div>
                <div>🔴 Close: ${close}</div>
            `;

      const coordinate = series.priceToCoordinate(close);
      if (coordinate === null) return;

      let shiftedCoordinate = (asParam.point?.x ?? 0) - toolTipWidth / 2;
      shiftedCoordinate = Math.max(
        0,
        Math.min(container.clientWidth - toolTipWidth, shiftedCoordinate)
      );

      const coordinateY =
        coordinate - toolTipHeight - toolTipMargin > 0
          ? coordinate - toolTipHeight - toolTipMargin
          : Math.max(
              0,
              Math.min(
                container.clientHeight - toolTipHeight - toolTipMargin,
                coordinate + toolTipMargin
              )
            );

      toolTip.style.left = `${shiftedCoordinate}px`;
      toolTip.style.top = `${coordinateY - 50}px`;
      toolTip.style.display = "block";
    }

    chart.subscribeCrosshairMove(handleCrosshair);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshair);
    };
  }, [allOhlcData, objectSelected]);

  return (
    <div className="relative">
      <div
        className="bg-[#222]"
        ref={chartContainerRef}
        style={{ width: "90vw", height: "95vh" }}
      />
      <div
        ref={tooltipRef}
        className="hidden absolute bg-gray-800  text-white text-xs px-2 py-1 rounded-md border-blue-900 border-2 shadow-md z-40"
      ></div>
      {/* history loading overlay */}
      {isLoadingHistory ? (
        <>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-auto z-50 bg-black opacity-40"></div>
          <div className="absolute inset-0 gap-1 pt-40 pb-40 flex items-center justify-center z-[60]">
            <div className="flex flex-col items-center animate-[bounce_1s_ease-in-out_infinite_0.1s]">
              <div className="w-1 h-6 bg-green-500"></div>
              <div className="w-3 h-12 bg-green-500 rounded-sm"></div>
              <div className="w-1 h-6 bg-green-500"></div>
            </div>

            <div className="flex flex-col items-center animate-[bounce_1s_ease-in-out_infinite_0.2s]">
              <div className="w-1 h-6 bg-red-500"></div>
              <div className="w-3 h-12 bg-red-500 rounded-sm"></div>
              <div className="w-1 h-6 bg-red-500"></div>
            </div>

            <div className="flex flex-col items-center animate-[bounce_1s_ease-in-out_infinite_0.1s]">
              <div className="w-1 h-6 bg-green-500"></div>
              <div className="w-3 h-12 bg-green-500 rounded-sm"></div>
              <div className="w-1 h-6 bg-green-500"></div>
            </div>
          </div>
        </>
      ) : null}
      {/* trendline toolbar when a line is selected */}
      {lineToolbarPos && selectedLineRef.current ? (
        <div
          className="absolute z-40 flex items-center gap-2 p-2 rounded-md bg-gray-900 border border-gray-700 shadow"
          style={{
            left: Math.max(0, lineToolbarPos.x - 80),
            top: Math.max(0, lineToolbarPos.y - 50),
          }}
        >
          <input
            type="color"
            value={lineColor}
            onChange={(e) => {
              setLineColor(e.target.value);
              updateSelectedLineStyle({ color: e.target.value });
            }}
          />
          <input
            type="range"
            min={1}
            max={10}
            value={lineWidth}
            onChange={(e) => {
              const w = Number(e.target.value);
              setLineWidth(w);
              updateSelectedLineStyle({ width: w });
            }}
          />
          <button
            className="text-red-300 hover:text-red-500"
            onClick={() => {
              deleteSelectedLine();
              setLineToolbarPos(null);
            }}
            title="Delete line"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Edit panel (TradingView-like) */}
      {lineToolbarPos && selectedLineRef.current && editState ? (
        <div
          className="absolute z-50 p-2 rounded-md bg-gray-900 border border-gray-700 shadow max-w-xs"
          style={{
            left: Math.max(0, (lineToolbarPos.x || 0) - 120),
            top: Math.max(0, (lineToolbarPos.y || 0) + 10),
          }}
        >
          {editState.kind === "position" ? (
            <div className="flex flex-col gap-2 text-sm text-white">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Position</div>
                <div className="text-xs text-gray-300">{editState.side}</div>
              </div>
              <label className="text-xs">Entry</label>
              <input
                className="bg-gray-800 p-1 rounded text-sm"
                value={String(editState.entryPrice)}
                onChange={(e) =>
                  setEditState((s: any) => ({
                    ...s,
                    entryPrice: Number(e.target.value),
                  }))
                }
              />
              <label className="text-xs">TP</label>
              <input
                className="bg-gray-800 p-1 rounded text-sm"
                value={String(editState.tp)}
                onChange={(e) =>
                  setEditState((s: any) => ({
                    ...s,
                    tp: Number(e.target.value),
                  }))
                }
              />
              <label className="text-xs">SL</label>
              <input
                className="bg-gray-800 p-1 rounded text-sm"
                value={String(editState.sl)}
                onChange={(e) =>
                  setEditState((s: any) => ({
                    ...s,
                    sl: Number(e.target.value),
                  }))
                }
              />

              <label className="text-xs">Band width</label>
              <input
                className="bg-gray-800 p-1 rounded text-sm"
                value={String(editState.bandWidth)}
                onChange={(e) =>
                  setEditState((s: any) => ({
                    ...s,
                    bandWidth: Number(e.target.value),
                  }))
                }
              />
              <div className="flex gap-2 pt-1">
                <button
                  className="bg-blue-600 px-2 py-1 rounded text-sm"
                  onClick={() => {
                    const sel: any = selectedLineRef.current;
                    if (!sel) return;
                    if (sel.setTp) sel.setTp(Number(editState.tp));
                    if (sel.setSl) sel.setSl(Number(editState.sl));
                    if (sel.setEntry) {
                      sel.setEntry({
                        ...(sel._entry ?? {}),
                        price: Number(editState.entryPrice),
                      });
                    } else if (sel._entry) {
                      sel._entry.price = Number(editState.entryPrice);
                      sel.updateAllViews?.();
                    }
                    if (
                      sel.setBandWidth &&
                      typeof editState.bandWidth === "number"
                    ) {
                      sel.setBandWidth(Number(editState.bandWidth));
                    } else if (
                      sel.updateOptions &&
                      typeof editState.bandWidth === "number"
                    ) {
                      sel.updateOptions({
                        bandWidth: Number(editState.bandWidth),
                      } as any);
                    }
                    if (sel.updateOptions && editState.side) {
                      sel.updateOptions({ side: editState.side } as any);
                    }
                    sel.updateAllViews?.();
                    saveDrawings?.();
                    bumpSelectionTick?.();
                  }}
                >
                  Apply
                </button>
                <button
                  className="bg-gray-700 px-2 py-1 rounded text-sm"
                  onClick={() => {
                    setEditState((s: any) => ({
                      ...s,
                      side: s.side === "long" ? "short" : "long",
                    }));
                  }}
                >
                  Toggle Side
                </button>
                <button
                  className="bg-red-600 px-2 py-1 rounded text-sm"
                  onClick={() => {
                    deleteSelectedLine();
                    setEditState(null);
                  }}
                >
                  Delete
                </button>
              </div>
              <div className="text-xs text-gray-300">
                {(() => {
                  const entry = Number(editState.entryPrice);
                  const tp = Number(editState.tp);
                  const sl = Number(editState.sl);
                  const risk = Math.abs(entry - sl);
                  const reward = Math.abs(tp - entry);
                  const rr = risk > 0 ? (reward / risk).toFixed(2) : "-";
                  return `R:R ${rr}`;
                })()}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 text-sm text-white">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Line</div>
              </div>
              <label className="text-xs">Point A (price)</label>
              <input
                className="bg-gray-800 p-1 rounded text-sm"
                value={String(editState.p1price)}
                onChange={(e) =>
                  setEditState((s: any) => ({
                    ...s,
                    p1price: Number(e.target.value),
                  }))
                }
              />
              <label className="text-xs">Point B (price)</label>
              <input
                className="bg-gray-800 p-1 rounded text-sm"
                value={String(editState.p2price)}
                onChange={(e) =>
                  setEditState((s: any) => ({
                    ...s,
                    p2price: Number(e.target.value),
                  }))
                }
              />
              <label className="text-xs">Color</label>
              <input
                type="color"
                value={editState.color}
                onChange={(e) =>
                  setEditState((s: any) => ({ ...s, color: e.target.value }))
                }
              />
              <label className="text-xs">Width</label>
              <input
                type="range"
                min={1}
                max={10}
                value={editState.width}
                onChange={(e) =>
                  setEditState((s: any) => ({
                    ...s,
                    width: Number(e.target.value),
                  }))
                }
              />
              <div className="flex gap-2 pt-1">
                <button
                  className="bg-blue-600 px-2 py-1 rounded text-sm"
                  onClick={() => {
                    const sel: any = selectedLineRef.current;
                    if (!sel) return;
                    // apply prices if available
                    if (sel._p1) sel._p1.price = Number(editState.p1price);
                    if (sel._p2) sel._p2.price = Number(editState.p2price);
                    if (sel.updateAllViews) sel.updateAllViews();
                    // update style
                    if (sel.updateOptions) {
                      sel.updateOptions({
                        lineColor: editState.color,
                        width: editState.width,
                      });
                    }
                    saveDrawings?.();
                    bumpSelectionTick?.();
                  }}
                >
                  Apply
                </button>
                <button
                  className="bg-red-600 px-2 py-1 rounded text-sm"
                  onClick={() => {
                    deleteSelectedLine();
                    setEditState(null);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {/* connection status indicator */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2">
        <div
          title={connectionStatus}
          className={
            "w-3 h-3 rounded-full shadow-md " +
            (connectionStatus === "open"
              ? "bg-green-500"
              : connectionStatus === "connecting" ||
                connectionStatus === "reconnecting"
              ? "bg-yellow-400"
              : connectionStatus === "error"
              ? "bg-red-500"
              : "bg-gray-500")
          }
        />
      </div>
    </div>
  );
}
