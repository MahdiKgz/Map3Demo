import React, { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { gsap } from "gsap";

function ChaseStatus() {
  const chasedId = useSelector((s) => s.chase?.activeModelId);
  const lat = useSelector((s) => s.chase?.lat);
  const lng = useSelector((s) => s.chase?.lng);
  const message = useSelector((s) => s.chase?.message);
  const activeAccidents = useSelector((s) => s.models?.activeAccidents);

  // Get current accident for the chased model
  const currentAccident = chasedId ? activeAccidents?.[chasedId] : null;

  const rootRef = useRef(null);
  const msgRef = useRef(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (chasedId) {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: -12, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, ease: "power2.out" }
      );
    }
  }, [chasedId]);

  useEffect(() => {
    const el = msgRef.current;
    if (!el) return;
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: 0.25 }
    );
  }, [message, currentAccident]);

  if (!chasedId) return null;

  return (
    <div
      ref={rootRef}
      className="fixed top-28 right-16 bg-black/70 px-6 py-4 rounded-lg z-[100000] text-center shadow-lg backdrop-blur"
    >
      <div className="text-base font-semibold flex items-center gap-2">
        مدل در حال تعقیب: {chasedId}
        {currentAccident && currentAccident.isActive && (
          <span className="text-red-400 text-xs bg-red-500/20 px-2 py-1 rounded">
            تصادف
          </span>
        )}
      </div>
      <div className="text-sm mt-1 flex flex-col items-start">
        موقعیت لحظه ای :
        <span dir="ltr">
          ({lat?.toFixed?.(6) ?? "0.000000"}, {lng?.toFixed?.(6) ?? "0.000000"})
        </span>
      </div>
      {(message ||
        (currentAccident &&
          currentAccident.isActive &&
          currentAccident.message)) && (
        <div ref={msgRef} className="text-sm mt-2">
          توضیحات :{" "}
          {currentAccident &&
          currentAccident.isActive &&
          currentAccident.message
            ? currentAccident.message
            : message}
        </div>
      )}
    </div>
  );
}

export default ChaseStatus;
