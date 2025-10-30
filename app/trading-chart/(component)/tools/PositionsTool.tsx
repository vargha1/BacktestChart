"use client";
import React from "react";
import ButtonComponent from "@/app/(UI)/ButtonComponent";
import { SelectedTools } from "@/app/(store)/SelectedTools";

function PositionsTool() {
  const { setTools, objectSelected } = SelectedTools();
  return (
    <div className="flex flex-col items-center gap-2">
      <ButtonComponent
        text={objectSelected.title === "Long Position" ? "Long ✓" : "Long"}
        className={"text-xs"}
        onclick={() => setTools({ title: "Long Position", isSelected: true })}
      />
      <ButtonComponent
        text={objectSelected.title === "Short Position" ? "Short ✓" : "Short"}
        className={"text-xs"}
        onclick={() => setTools({ title: "Short Position", isSelected: true })}
      />
    </div>
  );
}

export default PositionsTool;
