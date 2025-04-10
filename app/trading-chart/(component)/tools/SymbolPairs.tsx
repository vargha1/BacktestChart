'use client'
import { useSelector } from '@/app/(store)/SelectedSymbol';
import ButtonComponent from '@/app/(UI)/ButtonComponent';
import ModalComponent from '@/app/trading-chart/(component)/ModalSymbols';
import React, { useState } from 'react';
import { BiSearch } from 'react-icons/bi';


function SymbolPairs() {
    const { selectedSymbol } = useSelector();
    const [showSymbol, setShowSymbol] = useState<boolean>(false);

    const showFn = () => {
        setShowSymbol(!showSymbol);
    };

    return (
        <div>
            <div className='flex items-center gap-2 hover:bg-[#3D3D3D] rounded-md'>
                <BiSearch />
                <ButtonComponent text={selectedSymbol.symbol} className={'hover:bg-[#3D3D3D]'} onclick={showFn} />
            </div>
            {showSymbol ? (
                <ModalComponent
                    title='Symbol Search'
                    showFn={showFn}
                    show={showSymbol}
                />
            ) : (
                null
            )}

        </div>
    );
}

export default SymbolPairs;
