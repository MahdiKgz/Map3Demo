import React from "react";

function HamburgerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24px"
      height="24px"
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M4 7L7 7M20 7L11 7"
        stroke="#FFF"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M20 17H17M4 17L13 17"
        stroke="#FFF"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M4 12H7L20 12"
        stroke="#FFF"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default HamburgerIcon;
