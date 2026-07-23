"use client";

import { useSyncExternalStore } from "react";

const subscribe = (callback: () => void) => {
  window.addEventListener("themechange", callback);
  return () => window.removeEventListener("themechange", callback);
};

const getSnapshot = () => document.documentElement.classList.contains("dark");
const getServerSnapshot = () => false;

export default function DarkModeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("dark", next ? "1" : "0"); } catch {}
    window.dispatchEvent(new Event("themechange"));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={
        showLabel
          ? "flex h-9 w-full items-center justify-between rounded-lg px-2 text-black transition-colors hover:bg-black/5"
          : "flex h-7 w-7 items-center justify-center rounded-xl border border-black/15 bg-white text-black shadow-sm transition-colors hover:border-black hover:bg-black hover:text-white"
      }
    >
      {showLabel && <span className="text-xs font-semibold">Color mode</span>}
      <span className="flex items-center gap-2">
        {showLabel && (
          <span className="text-xs font-medium text-black/50">{dark ? "Dark" : "Light"}</span>
        )}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="currentColor"
      >
        <path d="M20.1 14.4A7.8 7.8 0 0 1 9.6 3.9 8.3 8.3 0 1 0 20.1 14.4Z" />
      </svg>
      </span>
    </button>
  );
}


