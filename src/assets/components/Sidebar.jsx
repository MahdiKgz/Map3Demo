import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import CloseIcon from "../icons/CloseIcon";
import ModelCard from "./ModelCard/ModelCard";

function Sidebar({ isOpen = false, setIsOpen }) {
  const rootRef = useRef(null);
  const tweenRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    gsap.set(root, { x: -800, autoAlpha: 0 });
    tweenRef.current = gsap.to(root, {
      x: 0,
      autoAlpha: 1,
      duration: 0.35,
      ease: "power3.out",
      paused: true,
    });
    return () => tweenRef.current?.kill();
  }, []);

  useEffect(() => {
    if (!tweenRef.current) return;
    if (isOpen) tweenRef.current.play();
    else tweenRef.current.reverse();
  }, [isOpen]);

  return (
    <div
      ref={rootRef}
      className="w-sm h-[80%] bg-black/80 flex flex-col items-start gap-8 fixed left-4 inset-y-[100px] p-4 pr-6 rounded-lg"
    >
      <div className="w-full flex items-center justify-between">
        <h1 className="text-xl font-semibold">مدیریت مدل ها</h1>
        <button onClick={() => setIsOpen(false)}>
          <CloseIcon />
        </button>
      </div>
      <div className="w-full">
        <ModelCard />
      </div>
    </div>
  );
}

export default Sidebar;
