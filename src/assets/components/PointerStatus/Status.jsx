import React from "react";
import { useSelector } from "react-redux";

function Status() {
  const { lat, lng, zoom, scale } = useSelector((state) => state.status);

  return (
    <div className="w-full h-16 bg-black/80 fixed flex items-center justify-start gap-6 bottom-0 right-0 left-0 mx-auto p-6 rounded-t-lg z-[99999]">
      <div className="flex items-center justify-between w-auto gap-6">
        <div className="flex items-center gap-[7px]">
          <span className="text-xs text-gray-200">طول جغرافیایی:</span>
          <span className="text-sm font-mono">
            {lat?.toFixed(6) || "0.000000"}
          </span>
        </div>
        <div className="flex items-center gap-[7px]">
          <span className="text-xs text-gray-200">عرض جغرافیایی:</span>
          <span className="text-sm font-mono">
            {lng?.toFixed(6) || "0.000000"}
          </span>
        </div>
        <div className="flex items-center gap-[7px]">
          <span className="text-xs text-gray-200">بزرگنمایی:</span>
          <span className="text-sm font-mono">
            {zoom?.toFixed(2) || "0.00"}
          </span>
        </div>
        <div className="flex items-center gap-[7px]">
          <span className="text-xs text-gray-200">مقیاس:</span>
          <span className="text-sm font-mono">
            {scale?.toFixed(2) || "0.00"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default Status;
