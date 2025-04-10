import React from 'react'
import ButtonComponent from './ButtonComponent'
import { FaTimes } from 'react-icons/fa'


interface ModalProps {
    title: string;
    show: boolean;
    onClose: () => void;
    children?: React.ReactNode; 
    className : string
}

function ModalComponent({title , show , onClose , children , className} : ModalProps) {
    if (show) {
        return (
          <div className='fixed w-[100vw] h-[100vh] flex justify-center items-center z-50 top-0 left-0 bg-[#07070755]'>
              <div className={className}>
                  <div className='flex justify-between'>
                      <h2>{title}</h2>
                      <ButtonComponent text={<FaTimes/>} onclick={onClose}/>
                  </div>
                  <div>
                      {children}
                  </div>
              </div>
          </div>
        )
        
    }else{
        return null
    }
}

export default ModalComponent