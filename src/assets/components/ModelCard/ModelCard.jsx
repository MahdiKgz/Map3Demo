import React, { useRef, useState, useEffect } from "react";
import { gsap } from "gsap";

function ModelCard() {
  const [active, setActive] = useState(false);
  const cardRef = useRef(null);
  const detailsRef = useRef(null);
  const tlRef = useRef(null);
  const [speed, setSpeed] = useState(5);

  useEffect(() => {
    const card = cardRef.current;
    const details = detailsRef.current;

    gsap.set(details, { height: 0, autoAlpha: 0, overflow: "hidden" });

    tlRef.current = gsap.timeline({ paused: true }).to(details, {
      duration: 0.35,
      height: "auto",
      autoAlpha: 1,
      ease: "power2.out",
    });

    return () => tlRef.current?.kill();
  }, []);

  useEffect(() => {
    const tl = tlRef.current;
    if (!tl) return;
    if (active) tl.play();
    else tl.reverse();
  }, [active]);

  return (
    <div
      ref={cardRef}
      onClick={() => setActive((s) => !s)}
      className="cursor-pointer flex flex-col items-start gap-1 bg-gray-700 w-full h-auto p-3 rounded-lg"
    >
      <h1 className="font-semibold text-white text-base">اسم مدل</h1>
      <span className="font-semibold text-xs text-gray-300">یه متن رندوم</span>
      <a href="#" className="text-gray-300 text-sm">
        https://localhost:5173/model.glb
      </a>

      {/* details */}
      <div
        ref={detailsRef}
        className="w-full mt-3 flex flex-col items-start gap-3 bg-gray-600/50 rounded p-3 text-gray-100"
      >
        <div className="w-full flex flex-col items-start gap-1">
          <label className="text-sm">سرعت: {speed}</label>
          <input
            type="range"
            min="0"
            max="10"
            step="1"
            className="w-full accent-green-500 custom-range"
            value={speed}
            onChange={(e) => {
              e.stopPropagation();
              setSpeed(+e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </div>
  );
}

export default ModelCard;
