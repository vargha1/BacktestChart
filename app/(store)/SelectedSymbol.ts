import { create } from "zustand";

interface typeSelected {
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

type store = {
    selectedSymbol: typeSelected,
    setSelector: (item: typeSelected) => void
}

export const useSelector = create<store>((set) => ({
    selectedSymbol: {
        symbol: 'BTCUSDT',
        status: "BREAK",
        BaseAsset: null,
        allowTrailingStop: false,
        allowedSelfTradePreventionModes: [],
        baseAsset: null,
        baseAssetPrecision: 0,
        baseCommissionPrecision: 0,
        cancelReplaceAllowed: false,
        defaultSelfTradePreventionMode: null,
        filters: [],
        icebergAllowed: false,
        isMarginTradingAllowed: false,
        isSpotTradingAllowed: false,
        ocoAllowed: false,
        orderTypes: ['LIMIT', 'LIMIT_MAKER', 'MARKET', 'STOP_LOSS', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT', 'TAKE_PROFIT_LIMIT'],
        otoAllowed:false,
        permissionSets: [],
        permissions: [],
        quoteAsset: null,
        quoteAssetPrecision: 0,
        quoteCommissionPrecision: 0,
        quoteOrderQtyMarketAllowed: false,
        quotePrecision: 0
    },

    setSelector: (item) => set(() => ({
        selectedSymbol: item
    }))


}))