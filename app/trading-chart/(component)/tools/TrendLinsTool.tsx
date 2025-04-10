'use client'
import { SelectedTools } from '@/app/(store)/SelectedTools'
import ButtonComponent from '@/app/(UI)/ButtonComponent'
import IcinParallelChanel from '@/app/(UI)/icons/IcinParallelChanel'
import IconCrossLine from '@/app/(UI)/icons/IconCrossLine'
import IconDisjointChannel from '@/app/(UI)/icons/IconDisjointChannel'
import IconExtendedLine from '@/app/(UI)/icons/IconExtendedLine'
import IconFlatTopBottom from '@/app/(UI)/icons/IconFlatTopBottom'
import IconHorizontalLine from '@/app/(UI)/icons/IconHorizontalLine'
import IconHorizontalRay from '@/app/(UI)/icons/IconHorizontalRay'
import IconInfoLine from '@/app/(UI)/icons/IconInfoLine'
import IconLine from '@/app/(UI)/icons/IconLine'
import IconRay from '@/app/(UI)/icons/IconLine'
import IconPitchfork from '@/app/(UI)/icons/IconPitchfork'
import IconRegressionTrend from '@/app/(UI)/icons/IconRegressionTrend'
import IconSchiffPitchfork from '@/app/(UI)/icons/IconSchiffPitchfork'
import IconTrendAngle from '@/app/(UI)/icons/IconTrendAngle'
import IconVerticalLine from '@/app/(UI)/icons/IconVerticalLine'
import React, { useEffect, useRef, useState } from 'react'
import { FaChevronRight } from 'react-icons/fa'
import { IoIosStarOutline } from 'react-icons/io'
import { TbLine } from 'react-icons/tb'

interface ITool {
  title: string | null,
  icon: React.ReactNode | null,
  _id : string | null
};


interface IToolWithMeta extends ITool {
  isSelected: boolean;
  isFavorite: boolean;
  _id: string;
};

const Tools: { type: string; children: IToolWithMeta[] }[] = [
  {
    type: 'LINES',
    children: [
      {
        title: 'Trend Line',
        icon: <IconLine />,
        isSelected: false,
        isFavorite: false,
        _id: 'TrendLineTools'
      },
      {
        title: 'Ray',
        icon: <IconRay />,
        isSelected: false,
        isFavorite: false,
        _id: 'RayTools'
      },
      {
        title: 'Info Line',
        icon: <IconInfoLine />,
        isSelected: false,
        isFavorite: false,
        _id: 'InfoLineTools'
      },
      {
        title: 'Extended Line',
        icon: <IconExtendedLine />,
        isSelected: false,
        isFavorite: false,
        _id: 'ExtendedLineTools'
      },
      {
        title: 'Trend Angle',
        icon: <IconTrendAngle />,
        isSelected: false,
        isFavorite: false,
        _id: 'TrendAngleTools'
      },
      {
        title: 'Horizontal Line',
        icon: <IconHorizontalLine />,
        isSelected: false,
        isFavorite: false,
        _id: 'HorizontalLineTools'
      },
      {
        title: 'HorizontalRay',
        icon: <IconHorizontalRay />,
        isSelected: false,
        isFavorite: false,
        _id: 'horizontalRayTools'
      },
      {
        title: 'Vertical Line',
        icon: <IconVerticalLine />,
        isSelected: false,
        isFavorite: false,
        _id: 'VerticalLineTools'
      },
      {
        title: 'Cross Line',
        icon: <IconCrossLine />,
        isSelected: false,
        isFavorite: false,
        _id: 'CrossLineTools'
      }
    ]
  },
  {
    type: 'CHANNELS',
    children: [
      {
        title: 'Parallel Channel',
        icon: <IcinParallelChanel/>,
        isSelected: false,
        isFavorite: false,
        _id: 'ParallelChannelTools'
      },
      {
        title: 'Regression Trend',
        icon: <IconRegressionTrend/>,
        isSelected: false,
        isFavorite: false,
        _id: 'RegressionTrendTools'
      },
      {
        title: 'Flat Top/Bottom',
        icon:  <IconFlatTopBottom/>,
        isSelected: false,
        isFavorite: false,
        _id: 'FlatTopBottomTools'
      },
      {
        title: 'Disjoint Channel',
        icon: <IconDisjointChannel/>,
        isSelected: false,
        isFavorite: false,
        _id: 'DisjointChannelTools'
      }
    ]
  },
  {
    type: 'PITCHFORKS',
    children: [
      {
        title: 'Pitchfork',
        icon: <IconPitchfork/>,
        isSelected: false,
        isFavorite: false,
        _id: 'PitchforksTools'
      },
      {
        title: 'Schiff Pitchfork',
        icon: <IconSchiffPitchfork/>,
        isSelected: false,
        isFavorite: false,
        _id: 'SchiffPitchforkTools'
      },
      {
        title: 'Modified Schiff Pitchfork',
        icon: <TbLine />,
        isSelected: false,
        isFavorite: false,
        _id: 'ModifiedSchiffPitchforkTools'
      },
      {
        title: 'Inside pitchfork',
        icon: <TbLine />,
        isSelected: false,
        isFavorite: false,
        _id: 'InsidePitchforkTools'
      }
    ]
  }
];


function TrendLinsTool() {

  const { setTools } = SelectedTools();
  const [showTools, setShowTools] = useState<boolean>(false);
  const [tool, setTool] = useState<ITool | null>({ title: Tools[0].children[0].title, icon: Tools[0].children[0].icon, _id: Tools[0].children[0]._id });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{
    const handleClickOutSide =(e : MouseEvent)=>{
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowTools(false);
      }
    };

    document.addEventListener('mousedown' , handleClickOutSide);
    return()=> document.removeEventListener('mousedown' , handleClickOutSide)
  },[])


  const handleClick = (param: ITool) => {
    if (!param.title || !param.icon) return
    // if (param.title === tool?.title) return
    setTools({ title: param.title, isSelected: true });
    setTool({ title: param.title, icon: param.icon , _id : param._id});
    setShowTools(false)
  }

  useEffect(() => {
    console.log(tool)
  }, [tool]);

  const setFavoriteTool = () => {

  }

  return (
    <div ref={menuRef}>
      <div className='flex items-center justify-between gap-1'>
        <div className='hover:bg-[#2E2E2E] my-auto  rounded-md'>
          <ButtonComponent text={tool?.icon} className={'text-2xl '} onclick={() => handleClick(tool)} />
        </div>
        <div className='rounded-md hover:bg-[#2E2E2E] px-1'>
          <ButtonComponent text={<FaChevronRight className='w-full h-full' />} className={'text-[8px] h-full'} onclick={() => showTools ? setShowTools(false) : setShowTools(true)} />
        </div>
        {
          showTools ? (
            <div className='bg-[#1F1F1F] absolute top-0 left-12  z-50 rounded-md h-[90vh] md:w-[25vw] w-[40vw] overflow-scroll scrollbar scrollbar-thumb-rounded-md scrollbar-w-1'>
              <ul>
                {Tools.map((tool, index: number) => (
                  <li key={index}>
                    <span className='text-[#767677] text-[12px]'>{tool.type}</span>
                    <ul className=''>
                      {tool.children.map((item, index: number) => (
                        <li key={index} className='flex hover:bg-[#2E2E2E] justify-between px-5'>
                          <div className='flex gap-3'>
                            <ButtonComponent text={item?.icon} className={' h-10  text-start text-[13px]'} onclick={() => handleClick(item)} />
                            <ButtonComponent text={item.title} className={'text-start text-[13px]'} onclick={()=> handleClick(item)}/>
                          </div>
                          <ButtonComponent text={<IoIosStarOutline />} onclick={setFavoriteTool} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            null
          )
        }
      </div>
    </div>
  )
}

export default TrendLinsTool