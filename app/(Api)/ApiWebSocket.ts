
import { UTCTimestamp } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';
import { useSelector } from '../(store)/SelectedSymbol';

interface DataOhlc {
    time: UTCTimestamp,
    open: number,
    high: number,
    low: number,
    close: number
}

export default function ApiWebSocket() {
    const [ohlcData, setOhlcData] = useState<DataOhlc[]>([]);
    const { selectedSymbol } = useSelector();
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        if (wsRef.current) {
            wsRef.current.close();
        };
        const timeOut = setTimeout(() => {
            const symbol = selectedSymbol.symbol?.toLowerCase();
    
            const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol}@kline_1s`);
            wsRef.current = ws;
            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                const candle = message.k;
                const newCandle = {
                    time: candle.t / 1000 as UTCTimestamp,
                    open: parseFloat(candle.o),
                    high: parseFloat(candle.h),
                    low: parseFloat(candle.l),
                    close: parseFloat(candle.c),
                };
    
                setOhlcData((prevData) => [...prevData.slice(-49), newCandle]);
            };
    
            ws.onerror = (error) => {
                console.error("WebSocket Error:", error);
            };
    
            ws.onclose = () => {
                console.log("WebSocket Closed.");
            };
    
        }, 1000);
        return () => {
            clearTimeout(timeOut)
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [selectedSymbol]);

    return ohlcData;
}
