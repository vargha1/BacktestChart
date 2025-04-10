import React from 'react'

function Loading() {
  return (
    <div className='w-full h-full flex justify-center items-center'>
      <div className='rounded-full border-dashed border-3 border-blue-600 w-52 h-52 bg-transparent animate-ping flex justify-center items-center'>
        <div className='rounded-full border-dashed border-3 border-blue-600 w-32 h-32 bg-transparent animate-ping flex justify-center items-center'>
          <div className='rounded-full border-dashed border-3 border-blue-600 w-24 h-24 bg-transparent animate-ping flex justify-center items-center'>
            <div className='rounded-full border-dashed border-3 border-blue-600 w-14 h-14 bg-transparent animate-ping flex justify-center items-center'>
              <div className='rounded-full border-dashed border-3 border-blue-600 w-4 h-4 bg-transparent animate-ping'></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Loading