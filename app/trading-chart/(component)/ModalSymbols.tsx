'use client'
import React, { useCallback, useMemo, useState } from 'react';
import ButtonComponent from '../../(UI)/ButtonComponent';
import { FaTimes } from 'react-icons/fa';
import { useSelector } from '../../(store)/SelectedSymbol';
import ApiSymbols from '../../(Api)/ApiSymbols';
import Loading from '../../(UI)/Loading';
import { BiSearch } from 'react-icons/bi';
import _ from 'lodash'

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

const buttonsFiltering = [
    {
        title: 'all',
        value: 'all',
        id: 1
    },
    {
        title: 'Stocks',
        value: 'stocks',
        id: 2
    },
    {
        title: 'Forex',
        value: 'forex',
        id: 3
    },
    {
        title: 'Fund',
        value: 'fund',
        id: 4
    },
    {
        title: 'Futures',
        value: 'futures',
        id: 5
    },
    {
        title: 'Crypto',
        value: 'crypto',
        id: 6
    },
    {
        title: 'Indices',
        value: 'indices',
        id: 7
    },
    {
        title: 'Bonds',
        value: 'bonds',
        id: 8
    },
    {
        title: 'Economy',
        value: 'economy',
        id: 9
    },
    {
        title: 'Options',
        value: 'options',
        id: 10
    }
]

function ModalComponent({ ...props }) {
    const [searchTerm, setSearchTerm] = useState<string>('');
    const { setSelector } = useSelector();

    const symbols : SymbolsPairs[] = ApiSymbols();

    const debouncedSearch = useCallback(
        _.debounce((value: string) => {
            setSearchTerm(value);
        }, 300),
        []
    );

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        debouncedSearch(e.target.value);
    };

    const filteredSymbols = useMemo(() => {
        if (!searchTerm.trim()) return symbols;
        return symbols.filter((item : SymbolsPairs) =>
            item.symbol.toUpperCase().includes(searchTerm.toUpperCase())
        );
    }, [searchTerm, symbols]);

    if (props.show) {

        return (
            <div className=' fixed w-[100vw] h-[100vh] flex justify-center items-center z-50 top-0 bg-[#07070755]'>
                <div className='relative flex flex-col gap-3 border rounded-md border-gray-600 md:w-[50vw] md:h-[80vh] overflow-y-scroll scrollbar scrollbar-w-2 scrollbar-thumb-[#5f5e5e] scrollbar-thumb-rounded-md bg-[#1F1F1F]  text-[#DBDBDB]'>
                    <div className='sticky top-0 bg-[#1F1F1F] z-20'>
                        <div className='flex justify-between items-center'>
                            <h2 className='mx-3 my-2'>{props.title}</h2>
                            <button onClick={props.showFn}><FaTimes /></button>
                        </div>
                        <div className='w-full flex gap-2 items-center border-y border-y-gray-500 px-3 '>
                            <BiSearch className='text-2xl' />
                            <input type="text" name="" id="" onChange={handleSearch} className='border-none outline-none py-3' placeholder='search' />
                        </div>
                        <div className='flex justify-evenly items-center gap-3 flex-wrap'>
                            {
                                buttonsFiltering.map((item) => (
                                    <ButtonComponent key={item.id} text={item.title} className='' />
                                ))
                            }
                        </div>
                    </div>
                    {
                        filteredSymbols.length > 0 ? (
                            <ul>
                                {
                                    filteredSymbols.map((item: SymbolsPairs, index: number) => (
                                        <li key={index} className=''>
                                            <ButtonComponent key={index} text={item.symbol}
                                                className='text-[#DBDBDB]  border-b border-b-gray-500 w-full text-start hover:bg-[#2E2E2E] px-3 py-2'
                                                onclick={() => setSelector(item)}
                                            />
                                        </li>
                                    ))
                                }
                            </ul>
                        ) : (
                            <Loading />
                        )
                    }

                </div>
            </div>
        )

    }
}

export default ModalComponent