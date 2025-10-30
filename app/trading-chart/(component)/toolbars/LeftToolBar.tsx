import TrendLinsTool from "../tools/TrendLinsTool";
import PositionsTool from "../tools/PositionsTool";

function LeftToolBar() {
  return (
    <div className="relative col-start-1 col-end-2 row-start-2 row-end-3 bg-[#070707] rounded-md text-[#ffff] flex flex-col items-center py-5 gap-3">
      <TrendLinsTool />
      <PositionsTool />
    </div>
  );
}

export default LeftToolBar;
