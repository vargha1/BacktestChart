import { UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "../(store)/SelectedSymbol";
import useSelectedTimeframe from "../(store)/SelectedTimeframe";

interface DataOhlc {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

// helper: map verbose timeframe from the store to binance websocket kline interval
function mapTimeframeToBinanceInterval(tf: string | undefined | null) {
  if (!tf) return "1s";
  const t = tf.toLowerCase().trim();
  // replace long words with single-letter units (months -> M uppercase)
  let out = t
    .replace(/seconds?/g, "s")
    .replace(/minutes?/g, "m")
    .replace(/hours?/g, "h")
    .replace(/days?/g, "d")
    .replace(/weeks?/g, "w")
    .replace(/months?/g, "M");
  // remove spaces (e.g. '6 h' -> '6h')
  out = out.replace(/\s+/g, "");
  return out;
}

// parse verbose timeframe like '45 minutes' -> { value: 45, unit: 'm' }
function parseTimeframe(tf: string | undefined | null) {
  if (!tf) return null;
  const s = tf.toLowerCase().trim();
  const m = s.match(
    /(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hour|hours|d|day|days|w|week|weeks|mon|month|months)/
  );
  if (!m) return null;
  const v = parseInt(m[1], 10);
  const u = m[2];
  if (!v || !u) return null;
  if (u.startsWith("s")) return { value: v, unit: "s" };
  if (u.startsWith("m") && u !== "mon") return { value: v, unit: "m" };
  if (u.startsWith("h")) return { value: v, unit: "h" };
  if (u.startsWith("d")) return { value: v, unit: "d" };
  if (u.startsWith("w")) return { value: v, unit: "w" };
  if (u.startsWith("mon") || u.startsWith("month"))
    return { value: v, unit: "M" };
  return null;
}

function nearestSupportedInterval(
  parsed: { value: number; unit: string } | null
) {
  if (!parsed) return "1m";
  const { value, unit } = parsed;
  if (unit === "s") return "1s";
  if (unit === "M") return "1M";
  if (unit === "w") return "1w";
  if (unit === "d") {
    if (value <= 1) return "1d";
    if (value <= 3) return "3d";
    return "1d";
  }
  if (unit === "h") {
    const hours = [1, 2, 4, 6, 8, 12];
    let best = hours[0];
    let minDiff = Math.abs(value - best);
    for (const h of hours) {
      const diff = Math.abs(value - h);
      if (diff < minDiff) {
        minDiff = diff;
        best = h;
      }
    }
    return `${best}h`;
  }
  // minutes
  const mins = [1, 3, 5, 15, 30];
  let best = mins[0];
  let minDiff = Math.abs(value - best);
  for (const m of mins) {
    const diff = Math.abs(value - m);
    if (diff < minDiff) {
      minDiff = diff;
      best = m;
    }
  }
  return `${best}m`;
}

function getValidatedInterval(tf: string | undefined | null) {
  const mapped = mapTimeframeToBinanceInterval(tf);
  const supported = new Set([
    "1s",
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "6h",
    "8h",
    "12h",
    "1d",
    "3d",
    "1w",
    "1M",
  ]);
  if (supported.has(mapped)) return mapped;
  const parsed = parseTimeframe(tf);
  return nearestSupportedInterval(parsed);
}

export default function ApiWebSocket() {
  const [ohlcData, setOhlcData] = useState<DataOhlc[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "open" | "closed" | "reconnecting" | "error"
  >("closed");
  const [isLoadingHistoryState, setIsLoadingHistoryState] = useState(false);
  const { selectedSymbol } = useSelector();
  const { timeframe } = useSelectedTimeframe();
  const wsRef = useRef<WebSocket | null>(null);
  const validatedIntervalRef = useRef<string>(getValidatedInterval(timeframe));
  const shouldStopRef = useRef(false);
  const loadingHistoryRef = useRef(false);

  useEffect(() => {
    // if there's an existing socket, close it so we can recreate for new symbol/interval
    if (wsRef.current) {
      wsRef.current.close();
    }
    // NOTE: do not immediately clear existing OHLC data here —
    // leaving the previous data visible until the new history arrives
    // avoids UI flicker where the chart shows then disappears.
    const timeOut = setTimeout(() => {
      const symbol = selectedSymbol.symbol?.toLowerCase();
      if (!symbol) return;
      // determine validated interval and fetch historical klines first
      const interval = getValidatedInterval(timeframe);
      validatedIntervalRef.current = interval;

      // fetch historical klines (REST) for previous 500 intervals and only
      // start the websocket after the initial history is loaded to avoid
      // live messages overwriting the fetched history (race condition).
      // Binance REST: /api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500
      // websocket with reconnect/backoff (declared here so it can be invoked after history load)
      let backoff = 1000; // start 1s
      const connect = () => {
        if (shouldStopRef.current) return;
        setConnectionStatus("connecting");
        const ws = new WebSocket(
          `wss://stream.binance.com:9443/ws/${symbol}@kline_${interval}`
        );
        wsRef.current = ws;

        ws.onopen = () => {
          backoff = 1000;
          setConnectionStatus("open");
        };

        ws.onmessage = (event) => {
          try {
            const raw = JSON.parse(event.data) as unknown;
            if (!raw || typeof raw !== "object") return;
            const maybeK = (raw as { k?: unknown }).k;
            if (!maybeK || typeof maybeK !== "object") return;
            const candle = maybeK as {
              t?: number | string;
              o?: number | string;
              h?: number | string;
              l?: number | string;
              c?: number | string;
            };
            const tnum = Number(candle.t);
            const newCandle: DataOhlc = {
              time: (Number.isFinite(tnum)
                ? tnum / 1000
                : Date.now() / 1000) as unknown as UTCTimestamp,
              open: parseFloat(String(candle.o)),
              high: parseFloat(String(candle.h)),
              low: parseFloat(String(candle.l)),
              close: parseFloat(String(candle.c)),
            };

            // tiny sanity check
            if (
              !Number.isFinite(newCandle.open) ||
              !Number.isFinite(newCandle.close)
            ) {
              console.warn(
                "ApiWebSocket: websocket produced invalid candle",
                candle
              );
              return;
            }

            // merge into state safely
            setOhlcData((prevData) => {
              try {
                if (!Array.isArray(prevData) || prevData.length === 0)
                  return [newCandle];
                const last = prevData[prevData.length - 1];
                // if same timestamp replace last, else append and cap length
                if (last.time === newCandle.time) {
                  const copy = prevData.slice(0, prevData.length - 1);
                  copy.push(newCandle);
                  // debug
                  // eslint-disable-next-line no-console
                  console.debug("ApiWebSocket: replaced last candle via ws", {
                    time: newCandle.time,
                  });
                  return copy;
                } else if (newCandle.time > last.time) {
                  const appended = [...prevData, newCandle];
                  // eslint-disable-next-line no-console
                  console.debug("ApiWebSocket: appended new candle via ws", {
                    time: newCandle.time,
                    newLength: appended.length,
                  });
                  return appended.slice(-500); // keep last 500
                } else {
                  // older than last -> ignore
                  // eslint-disable-next-line no-console
                  console.debug(
                    "ApiWebSocket: ignored out-of-order websocket candle",
                    { time: newCandle.time, last: last.time }
                  );
                  return prevData;
                }
              } catch (innerErr) {
                console.warn("failed to merge websocket candle", innerErr);
                return prevData;
              }
            });
          } catch (err) {
            console.warn("failed to parse websocket message", err);
            // don't close the socket; ignore malformed message
          }
        };

        ws.onerror = (err) => {
          console.error("WebSocket error", err);
          setConnectionStatus("error");
          ws.close();
        };

        ws.onclose = () => {
          if (shouldStopRef.current) {
            setConnectionStatus("closed");
            return;
          }
          setConnectionStatus("reconnecting");
          console.log("WebSocket closed, reconnecting in", backoff);
          setTimeout(() => {
            backoff = Math.min(backoff * 2, 30000); // exponential backoff cap 30s
            connect();
          }, backoff);
        };
      };

      const doInit = async (): Promise<boolean> => {
        setIsLoadingHistoryState(true);
        try {
          const limit = 1000; // Binance /api/v3/klines max per request is 1000
          const res = await fetch(
            `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`
          );
          if (!res.ok) throw new Error("historical fetch failed");
          const data = await res.json();
          // data is array of arrays: [openTime, open, high, low, close, ...]
          function parseKlineRow(row: unknown): DataOhlc | null {
            if (!Array.isArray(row)) return null;
            const [openTime, open, high, low, close] = row;
            const t =
              typeof openTime === "number" ? openTime : Number(openTime);
            const o =
              typeof open === "string" ? parseFloat(open) : Number(open);
            const h =
              typeof high === "string" ? parseFloat(high) : Number(high);
            const l = typeof low === "string" ? parseFloat(low) : Number(low);
            const c =
              typeof close === "string" ? parseFloat(close) : Number(close);
            if (
              Number.isFinite(t) &&
              Number.isFinite(o) &&
              Number.isFinite(h) &&
              Number.isFinite(l) &&
              Number.isFinite(c)
            ) {
              return {
                time: (t / 1000) as UTCTimestamp,
                open: o,
                high: h,
                low: l,
                close: c,
              } as DataOhlc;
            }
            return null;
          }

          const hist: DataOhlc[] = [];
          if (Array.isArray(data)) {
            for (const row of data) {
              const parsed = parseKlineRow(row);
              if (parsed) hist.push(parsed);
            }
          }

          // abort if the effect has been cleaned up or a new symbol change occurred
          if (shouldStopRef.current) {
            console.debug(
              "ApiWebSocket: doInit aborted because shouldStopRef is set"
            );
            setIsLoadingHistoryState(false);
            return false;
          }

          // ensure sorted ascending by time and log count
          hist.sort((a, b) => a.time - b.time);
          console.debug(
            "ApiWebSocket: fetched historical klines count=",
            hist.length,
            {
              earliest: hist[0]?.time,
              latest: hist[hist.length - 1]?.time,
            }
          );

          // apply historical data as initial ohlc set
          setOhlcData(hist);
          return true;
        } catch (err) {
          console.warn("failed to fetch historical klines", err);
          return false;
        } finally {
          // note: if we returned early above we already set loading false
          if (!shouldStopRef.current) setIsLoadingHistoryState(false);
        }
      };

      // run initialization (fetch history first, then connect only if the
      // history was applied and the effect hasn't been cleaned up)
      doInit().then((applied) => {
        if (applied && !shouldStopRef.current) {
          connect();
        } else {
          console.debug("ApiWebSocket: skipping websocket connect", {
            applied,
            shouldStop: shouldStopRef.current,
          });
        }
      });

      // stop connect on cleanup
      // store a reference so cleanup below can stop reconnect attempts
      shouldStopRef.current = false;
      // when cleanup runs we'll set shouldStopRef.current = true
    }, 1000);
    return () => {
      clearTimeout(timeOut);
      shouldStopRef.current = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [selectedSymbol, timeframe]);

  // helper to convert a validated interval like '15m' or '1h' to seconds
  function intervalToSeconds(interval: string) {
    if (!interval) return 60;
    const m = interval.match(/(\d+)([smhdwM])/);
    if (!m) return 60;
    const v = parseInt(m[1], 10);
    const u = m[2];
    switch (u) {
      case "s":
        return v;
      case "m":
        return v * 60;
      case "h":
        return v * 3600;
      case "d":
        return v * 86400;
      case "w":
        return v * 86400 * 7;
      case "M":
        return v * 86400 * 30; // approximate month
      default:
        return 60;
    }
  }

  // allow callers to request older historical klines ending before `beforeTime` (seconds UTC)
  async function loadMoreBefore(beforeTimeSec?: number, limit = 1000) {
    const symbol = selectedSymbol.symbol?.toLowerCase();
    if (!symbol) return false;
    // prevent concurrent history loads
    if (loadingHistoryRef.current) return false;
    loadingHistoryRef.current = true;
    setIsLoadingHistoryState(true);
    const interval =
      validatedIntervalRef.current || getValidatedInterval(timeframe);
    try {
      // eslint-disable-next-line no-console
      console.debug("ApiWebSocket.loadMoreBefore call", {
        symbol,
        interval,
        beforeTimeSec,
        requestedLimit: limit,
      });

      // Binance per-request max is 1000; batch requests until desired limit reached
      const maxPerRequest = 1000;
      let remaining = Math.max(1, limit || 1000);
      let endTimeMs = beforeTimeSec ? beforeTimeSec * 1000 - 1 : undefined;
      const hist: DataOhlc[] = [];

      while (remaining > 0) {
        const thisBatch = Math.min(maxPerRequest, remaining);
        const url = new URL(`https://api.binance.com/api/v3/klines`);
        url.searchParams.set("symbol", symbol.toUpperCase());
        url.searchParams.set("interval", interval);
        url.searchParams.set("limit", String(thisBatch));
        if (endTimeMs) url.searchParams.set("endTime", String(endTimeMs));

        const res = await fetch(url.toString());
        if (!res.ok) throw new Error("historical fetch failed");
        const data = await res.json();
        let rowsAdded = 0;
        if (Array.isArray(data) && data.length > 0) {
          for (const row of data) {
            const parsed = ((): DataOhlc | null => {
              if (!Array.isArray(row)) return null;
              const [openTime, open, high, low, close] = row;
              const t =
                typeof openTime === "number" ? openTime : Number(openTime);
              const o =
                typeof open === "string" ? parseFloat(open) : Number(open);
              const h =
                typeof high === "string" ? parseFloat(high) : Number(high);
              const l = typeof low === "string" ? parseFloat(low) : Number(low);
              const c =
                typeof close === "string" ? parseFloat(close) : Number(close);
              if (
                Number.isFinite(t) &&
                Number.isFinite(o) &&
                Number.isFinite(h) &&
                Number.isFinite(l) &&
                Number.isFinite(c)
              ) {
                return {
                  time: (t / 1000) as UTCTimestamp,
                  open: o,
                  high: h,
                  low: l,
                  close: c,
                } as DataOhlc;
              }
              return null;
            })();
            if (parsed) {
              hist.push(parsed);
              rowsAdded++;
            }
          }
          // update next endTime to one millisecond before the earliest candle we just got
          const earliestParsed = data[0]?.[0];
          if (earliestParsed !== undefined) {
            const earliestMs =
              typeof earliestParsed === "number"
                ? earliestParsed
                : Number(earliestParsed);
            if (Number.isFinite(earliestMs)) {
              endTimeMs = earliestMs - 1;
            }
          }
        }
        remaining -= thisBatch;
        // if API returned fewer than requested, no more data to fetch
        if (rowsAdded < thisBatch) break;
      }

      // eslint-disable-next-line no-console
      console.debug("ApiWebSocket.loadMoreBefore fetched", {
        rows: hist.length,
        earliest: hist[0]?.time,
        latest: hist[hist.length - 1]?.time,
      });

      if (!hist || hist.length === 0) {
        loadingHistoryRef.current = false;
        setIsLoadingHistoryState(false);
        return false;
      }
      let added = false;
      setOhlcData((prev) => {
        // prepend older data, dedupe by time
        const combined = [...hist, ...prev];
        const seen = new Set<number>();
        const deduped: DataOhlc[] = [];
        for (const item of combined) {
          if (!seen.has(item.time)) {
            seen.add(item.time);
            deduped.push(item);
          }
        }
        // determine if we actually added anything older than prev[0]
        if (prev.length === 0) added = deduped.length > 0;
        else added = deduped[0].time < prev[0].time;
        // keep last N points to avoid unbounded growth
        loadingHistoryRef.current = false;
        setIsLoadingHistoryState(false);
        return deduped.slice(-10000);
      });
      return added;
    } catch (err) {
      console.warn("failed to fetch historical klines (loadMoreBefore)", err);
      loadingHistoryRef.current = false;
      setIsLoadingHistoryState(false);
      return false;
    }
  }

  const intervalSeconds = intervalToSeconds(
    validatedIntervalRef.current || getValidatedInterval(timeframe)
  );

  type ApiWebSocketReturn = {
    ohlcData: DataOhlc[];
    connectionStatus:
      | "connecting"
      | "open"
      | "closed"
      | "reconnecting"
      | "error";
    loadMoreBefore: (
      beforeTimeSec?: number,
      limit?: number
    ) => Promise<boolean>;
    intervalSeconds: number;
    isLoadingHistory: boolean;
  };

  const result: ApiWebSocketReturn = {
    ohlcData,
    connectionStatus,
    loadMoreBefore,
    intervalSeconds,
    isLoadingHistory: isLoadingHistoryState,
  };

  return result;
}
