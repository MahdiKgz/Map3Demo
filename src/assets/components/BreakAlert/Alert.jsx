import gsap from "gsap";
import React from "react";
import { useEffect } from "react";
import { useRef } from "react";

function Alert() {
  const alertRef = useRef(null);

  useEffect(() => {
    gsap.fromTo(
      alertRef.current,
      { y: 60, opacity: 0 },
      { y: 0, opacity: 1, duration: 1.5, ease: "power2.out" }
    );
  }, []);

  return (
    <div
      ref={alertRef}
      className="w-[280px] fixed bottom-24 right-6 z-50 bg-black/80 text-white px-6 py-4 rounded-lg shadow-lg flex flex-col gap-2 items-start"
    >
      Alert
    </div>
  );
}

export default Alert;
