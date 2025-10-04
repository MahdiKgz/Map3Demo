import React, { useRef, useState, useEffect } from "react";
import { gsap } from "gsap";
import { useDispatch, useSelector } from "react-redux";
import {
  updateModelSpeed,
  setChasedModel,
} from "../../redux/slices/models.slice";
import { setChasedModelId } from "../../redux/slices/chase.slice";

function ModelCard({ model }) {
  const dispatch = useDispatch();
  const chasedModelId = useSelector((state) => state.models.chasedModelId);
  const isChased = chasedModelId === model.id;

  const [open, setOpen] = useState(false);
  const cardRef = useRef(null);
  const detailsRef = useRef(null);
  const tlRef = useRef(null);

  useEffect(() => {
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
    if (open) tl.play();
    else tl.reverse();
  }, [open]);

  const toggleChase = () => {
    const next = isChased ? null : model.id;
    dispatch(setChasedModel(next));
    dispatch(setChasedModelId(next));
  };

  return (
    <div
      ref={cardRef}
      onClick={() => {
        setOpen((s) => !s);
        toggleChase();
      }}
      className={`cursor-pointer flex flex-col items-start gap-3 bg-gray-700 w-full h-auto p-3 rounded-lg transition-all ${
        isChased ? "ring-2 ring-green-400" : "ring-1 ring-transparent"
      }`}
    >
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img className="w-16 h-16 rounded-lg" src={model.icon} alt="icon" />
          <h1 className="font-semibold text-white text-base">{model.id}</h1>
        </div>
        <button
          className={`px-2 py-1 rounded text-xs ${
            isChased ? "bg-green-500" : "bg-blue-500"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            toggleChase();
          }}
        >
          {isChased ? "توقف دنبال کردن" : "دنبال کن"}
        </button>
      </div>

      <span className="font-semibold text-xs text-gray-300">{model.url}</span>

      {/* details */}
      <div
        ref={detailsRef}
        className="w-full mt-1 flex flex-col items-start gap-4 bg-gray-600/50 rounded p-3 text-gray-100"
      >
        {model.type !== "satellite" && (
          <div className="w-full flex flex-col items-start gap-1">
            <label className="text-sm">
              سرعت: {Math.round((model.speed || 0) * 10000)}
            </label>
            <input
              type="range"
              min="0"
              max="4"
              step="1"
              className="w-full accent-green-500 custom-range"
              value={Math.round((model.speed || 0) * 10000)}
              onChange={(e) => {
                e.stopPropagation();
                const v = Number(e.target.value);
                const newSpeed = v === 0 ? 0 : (v / 10) * 0.001;
                dispatch(updateModelSpeed({ id: model.id, speed: newSpeed }));
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ModelCard;
