import SetChart from "../tools/SetChart"
import SymbolPairs from "../tools/SymbolPairs"
import TimeFrames from "../tools/TimeFrames"

function TopToolBar() {
  return (
    <header className='col-start-1 col-end-4 row-start-1 row-end-2 h-[5vh] bg-[#0F0F0F] rounded-md text-[#f7f7f7] flex items-center gap-3'>
      <SymbolPairs />
      <span className="text-gray-400 block">|</span>
      <TimeFrames />
      <span className="text-gray-400 block">|</span>
      <SetChart/>
    </header>
  )
}

export default TopToolBar