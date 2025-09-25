import React from "react";
import { useSelector } from "react-redux";

function Status() {
  const { lat, lng, zoom, scale } = useSelector((state) => state.status);

  return (
    <div className="w-[80%] h-16 bg-black/80 fixed flex items-center justify-around bottom-0 right-0 left-0 mx-auto p-6 rounded-t-lg z-[99999]">
      <div className="flex flex-col items-center">
        <span className="text-xs text-gray-400">Latitude</span>
        <span className="text-sm font-mono">
          {lat?.toFixed(6) || "0.000000"}
        </span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-xs text-gray-400">Longitude</span>
        <span className="text-sm font-mono">
          {lng?.toFixed(6) || "0.000000"}
        </span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-xs text-gray-400">Zoom</span>
        <span className="text-sm font-mono">{zoom?.toFixed(2) || "0.00"}</span>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-xs text-gray-400">Scale</span>
        <span className="text-sm font-mono">{scale?.toFixed(2) || "0.00"}</span>
      </div>
    </div>
  );
}

export default Status;
