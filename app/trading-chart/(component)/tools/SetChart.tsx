'use client'
import { useChartSeriesStore } from '@/app/(store)/UseChartSeriesStore'
import ButtonComponent from '@/app/(UI)/ButtonComponent'
import IconAreaChart from '@/app/(UI)/icons/IconAreaChart'
import IconBarsChart from '@/app/(UI)/icons/IconBarsChart'
import IconCandleChart from '@/app/(UI)/icons/IconCandleChart'
import IconLineChart from '@/app/(UI)/icons/IconLineChart'
import React, { useEffect, useRef, useState } from 'react'

const charts = [
    {
        title: 'Bars',
        type : 'bar',
        icon: <IconBarsChart />
    },
    {
        title: 'Candles',
        type : 'candlestick',
        icon: <IconCandleChart />
    },
    {
        title : 'Line',
        type : 'line',
        icon : <IconLineChart/>
    },
    {
        title : 'Area',
        type : 'area',
        icon : <IconAreaChart/>
    }
]

function SetChart() {
    const [showCharts, SetShowCharts] = useState<boolean>(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const {setSelectedType} = useChartSeriesStore();

    useEffect(()=>{
        const handelClickOutSide = (event : MouseEvent)=>{
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                SetShowCharts(false)
            }
        };

        document.addEventListener('mousedown' , handelClickOutSide);
        return ()=> document.removeEventListener('mousedown' , handelClickOutSide)
    },[])
    function handleClick() {
        if (!showCharts) SetShowCharts(false);
        SetShowCharts(true)
    }
    return (
        <div ref={menuRef}>
            <ButtonComponent text={<IconCandleChart />} onclick={handleClick} />
            {
                showCharts ? (
                    <div className=' absolute top-0 bg-[#1F1F1F] z-50 rounded-md py-3 w-[231px] max-h-[90vh]' >
                        <ul>
                            {charts.map((series, index: number) => (
                                <li key={index}>
                                    <div className='flex'>
                                        <ButtonComponent text={series.icon} onclick={()=> setSelectedType(series.type)}/>
                                        <ButtonComponent text={series.title} onclick={()=> setSelectedType(series.type)}/>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    null
                )
            }
        </div>
    )
}

export default SetChart