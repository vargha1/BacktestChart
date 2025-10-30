"use client";
import ButtonComponent from "@/app/(UI)/ButtonComponent";
import ModalComponent from "@/app/(UI)/ModalComponent";
import React, { useEffect, useRef, useState } from "react";
import useSelectedTimeframe from "@/app/(store)/SelectedTimeframe";

const timeFrames = [
  {
    title: "second",
    intervals: [
      "1 second",
      "5 seconds",
      "10 seconds",
      "15 seconds",
      "30 seconds",
      "45 seconds",
    ],
  },
  {
    title: "minutes",
    intervals: [
      "1 minute",
      "2 minutes",
      "3 minutes",
      "5 minutes",
      "10 minutes",
      "15 minutes",
      "30 minutes",
      "45 minutes",
    ],
  },
  {
    title: "hours",
    intervals: [
      "1 hour",
      "2 hours",
      "3 hours",
      "4 hours",
      "6 h",
      "8 h",
      "12 h",
    ],
  },
  { title: "days", intervals: ["1 day", "3 days"] },
  { title: "weeks", intervals: ["1 week", "2 weeks", "3 weeks"] },
  { title: "months", intervals: ["1 month", "2 months"] },
];

function TimeFrames() {
  const [showTimeFrames, setShowTimeFrames] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { timeframe, setTimeframe } = useSelectedTimeframe();

  useEffect(() => {
    function handelclickOutSide(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowTimeFrames(false);
      }
    }

    document.addEventListener("mousedown", handelclickOutSide);

    return () => document.removeEventListener("mousedown", handelclickOutSide);
  }, [setTimeframe, timeframe]);

  // Client-only sync: read persisted timeframe from localStorage after hydration.
  // We intentionally do this inside useEffect so it runs only on the client and
  // does not cause a server/client HTML mismatch during SSR.
  useEffect(() => {
    try {
      const stored = window?.localStorage?.getItem("timeframe");
      if (stored && stored !== timeframe) {
        setTimeframe(stored);
      }
    } catch {
      // ignore - localStorage may be unavailable in some environments
    }
    // empty deps: run only once on mount
  }, []);

  const handelShow = () => {
    setShowTimeFrames(!showTimeFrames);
  };

  const openModal = () => {
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <ButtonComponent
        text={shortLabel(timeframe)}
        className="text-white hover:bg-[#3D3D3D] rounded-md"
        onclick={handelShow}
      />
      {showTimeFrames && (
        <div className="z-50 absolute top-0 bg-[#211F21] w-[200px] md:max-h-[100vh] overflow-y-scroll scrollbar scrollbar-thumb-[#565353] scrollbar-w-1 scrollbar-thumb-rounded-md p-3 rounded-md">
          <div>
            <ButtonComponent
              text={"➕ add custom intervals"}
              className={"md:text-[12px]"}
              onclick={openModal}
            />
          </div>
          {timeFrames.map((time, index) => (
            <div key={index}>
              <span className="text-[#767677] text-[13px]">
                {time.title.toUpperCase()}
              </span>
              <ul>
                {time.intervals.map((item, index) => (
                  <li key={index}>
                    <ButtonComponent
                      text={item}
                      className={`hover:bg-[#3D3D3D] text-[#efefef] w-full text-start text-[14px] ${
                        timeframe === item ? "bg-[#3D3D3D]" : ""
                      }`}
                      onclick={() => {
                        setTimeframe(item);
                        setShowTimeFrames(false);
                      }}
                    />
                  </li>
                ))}
              </ul>
              <hr className="text-[#959595]" />
            </div>
          ))}
        </div>
      )}

      {/* helper to render compact label on main button */}

      {showModal && (
        <ModalComponent
          title={"Add Custom Interval"}
          className="bg-[#1F1F1F] text-[#D0D0D0] w-[25vw] h-[30vh] p-3"
          show={showModal}
          onClose={closeModal}
        >
          <form className="flex flex-col gap-5 p-5">
            <hr />
            <div className="flex justify-between w-3/4">
              <label htmlFor="type">type</label>
              <select
                name="typeTime"
                id="type"
                className="border px-5 rounded-md"
              >
                {timeFrames.map((item, index: number) => (
                  <option value="" key={index}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-between w-3/4 gap-3">
              <label htmlFor="interval">interval</label>
              <input
                type="number"
                name="interval"
                id="interval"
                className="border rounded-md px-3 w-[130px]"
              />
            </div>
            <hr />
            <div className="flex justify-around">
              <ButtonComponent text={"add"} visible={false} type={"submit"} />
              <ButtonComponent
                text="cancel"
                type={"button"}
                onclick={closeModal}
              />
            </div>
          </form>
        </ModalComponent>
      )}
    </div>
  );
}

// convert verbose timeframe like "1 minute" -> "1m", "6 h" -> "6h", "1 month" -> "1M"
function shortLabel(tf: string) {
  if (!tf) return "";
  let s = tf.trim();
  s = s.replace(/ seconds?/, "s");
  s = s.replace(/ minutes?/, "m");
  s = s.replace(/ hours?/, "h");
  s = s.replace(/\s+h\b/, "h");
  s = s.replace(/ days?/, "d");
  s = s.replace(/ weeks?/, "w");
  s = s.replace(/ months?/, "M");
  // remove remaining spaces between number and unit
  s = s.replace(/\s+/g, "");
  return s;
}

export default TimeFrames;
