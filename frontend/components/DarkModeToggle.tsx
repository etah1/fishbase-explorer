"use client";

import { useEffect, useState } from "react";

export default function DarkModeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("dark", next ? "1" : "0"); } catch {}
  }

  return (
    <button
      onClick={toggle}
      className="text-xs text-black"
    >
      {dark ? "Light" : "Dark"}
    </button>
  );
}
