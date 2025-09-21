import React from "react";
import Sidebar from "./Sidebar";
import { useState } from "react";
import CloseIcon from "../icons/CloseIcon";
import HamburgerIcon from "../icons/Menu";

function Header() {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="w-full bg-black/80 h-20 px-10 py-3 flex items-center justify-between">
      <h1 className="font-bold text-xl">دموی سامانه نقشه</h1>
      <button onClick={() => setIsOpen(!isOpen)}>
        <HamburgerIcon />
      </button>
      <Sidebar isOpen={isOpen} setIsOpen={setIsOpen} />
    </div>
  );
}

export default Header;
