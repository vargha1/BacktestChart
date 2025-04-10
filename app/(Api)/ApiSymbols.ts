import axios from 'axios';
import { useEffect, useState } from 'react'



interface SymbolsPairs {
    symbol: string | null,
    status: "TRADING" | "BREAK",
    BaseAsset: string | null,
    allowTrailingStop: boolean,
    allowedSelfTradePreventionModes: [],
    baseAsset: string | null,
    baseAssetPrecision: number,
    baseCommissionPrecision: number,
    cancelReplaceAllowed: boolean,
    defaultSelfTradePreventionMode: string  | null,
    filters: [],
    icebergAllowed: boolean,
    isMarginTradingAllowed: boolean,
    isSpotTradingAllowed: boolean,
    ocoAllowed: boolean,
    orderTypes: ['LIMIT', 'LIMIT_MAKER', 'MARKET', 'STOP_LOSS', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT', 'TAKE_PROFIT_LIMIT'],
    otoAllowed: boolean,
    permissionSets: [],
    permissions: [],
    quoteAsset: string  | null,
    quoteAssetPrecision: number,
    quoteCommissionPrecision: number,
    quoteOrderQtyMarketAllowed: boolean,
    quotePrecision: number
};

function ApiSymbols() {
    const [symbols, setSymbols] = useState<SymbolsPairs[]>([]);
    // const [selectedPairs, setSelectedPairs] = useState<SymbolsPairs | null>(null);

    useEffect(() => {
        const getBinancePairs = async () => {
            try {
                const response = await axios.get('https://api.binance.com/api/v3/exchangeInfo');
                setSymbols(response.data.symbols);
                // setSelectedPairs(response.data.symbols[0]);
            } catch (error: unknown) {
                if (axios.isAxiosError(error)) {
                    if (error.response?.status >= 400 && error.response?.status < 500) {
                        console.log('مشکلی در واکشی داده اتفاق افتاده است.');
                    } else if (error.response?.status >= 500) {
                        console.log('مشکلی در ارتباط با سرور رخ داده است.');
                    }
                } else {
                    console.log('یک خطای ناشناخته رخ داده است.');
                }
            }
        };

        getBinancePairs();
    }, []);

    return symbols
    
}

export default ApiSymbols