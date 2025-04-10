import TrendLinsTool from "../tools/TrendLinsTool"


function LeftToolBar() {
    return (
        <div className='relative col-start-1 col-end-2 row-start-2 row-end-3 bg-[#070707] rounded-md text-[#ffff] flex flex-col items-center py-5'>
            <TrendLinsTool/>
        </div>
    )
}

export default LeftToolBar