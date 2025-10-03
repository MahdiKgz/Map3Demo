import gsap from "gsap";
import React from "react";
import { useEffect, useState } from "react";
import { useRef } from "react";
import { useSelector } from "react-redux";

function Alert() {
  const alertRef = useRef(null);
  const activeAccidents = useSelector((state) => state.models.activeAccidents);
  const chasedModelId = useSelector((state) => state.models.chasedModelId);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Get the current accident for the chased model
  const currentAccident = chasedModelId ? activeAccidents[chasedModelId] : null;

  // Update timer every second
  useEffect(() => {
    if (!currentAccident) {
      // Reset timer when no accident
      setCurrentTime(Date.now());
      return;
    }

    // Initialize timer with current time when accident starts
    setCurrentTime(Date.now());

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [currentAccident]);

  useEffect(() => {
    if (currentAccident) {
      gsap.fromTo(
        alertRef.current,
        { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 1.5, ease: "power2.out" }
      );
    } else {
      gsap.to(alertRef.current, {
        y: 60,
        opacity: 0,
        duration: 0.5,
        ease: "power2.out",
      });
    }
  }, [currentAccident]);

  if (!currentAccident) return null;

  const elapsedTime = currentTime - currentAccident.startTime;
  const remainingTime = Math.max(0, currentAccident.duration - elapsedTime);
  const remainingSeconds = Math.ceil(remainingTime / 1000);

  // Hide alert if time has expired
  if (remainingTime <= 0) {
    return null;
  }

  return (
    <div
      ref={alertRef}
      className="w-[320px] fixed bottom-24 right-6 z-50 bg-red-600/90 text-white px-6 py-4 rounded-lg shadow-lg flex flex-col gap-3 items-start border-l-4 border-red-400"
    >
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 bg-red-400 rounded-full animate-pulse"></div>
        <h3 className="font-bold text-lg">اعلان تصادف</h3>
      </div>
      <p className="text-sm leading-relaxed">{currentAccident.message}</p>
      <div className="flex items-center gap-2 text-xs">
        <span>زمان باقی‌مانده:</span>
        <span className="bg-red-500/30 px-2 py-1 rounded">
          {remainingSeconds} ثانیه
        </span>
      </div>
    </div>
  );
}

export default Alert;
