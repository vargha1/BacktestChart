import React from 'react'
import Chart from './(component)/Chart'
import TopToolBar from './(component)/toolbars/TopToolBar'
import LeftToolBar from './(component)/toolbars/LeftToolBar'

function page() {
    return (
        <section className='grid grid-cols-[5vh , _1fr , 20vw] grid-rows-[5vh , 1fr , 10vh] gap-1 bg-[#2E2E2E]'>
            <TopToolBar />
            <LeftToolBar /> 
            <main className='col-start-2 col-end-4 row-start-2 row-end-3'>
                <Chart />
            </main>
            <footer className='col-start-1 col-end-4 row-start-3 row-end-4'>

            </footer>
        </section>
    )
}

export default page