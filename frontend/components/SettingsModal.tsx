"use client";

import { useEffect, useId, useState } from "react";
import type { User } from "@supabase/supabase-js";
import AccountSettings from "@/components/AccountSettings";
import DarkModeToggle from "@/components/DarkModeToggle";

type SettingsModalProps = {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onLogin: () => void;
  onLogout: () => void;
};

export default function SettingsModal({
  open,
  user,
  onClose,
  onLogin,
  onLogout,
}: SettingsModalProps) {
  const titleId = useId();
  const [tab, setTab] = useState<"general" | "account">("general");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function switchToLogin() {
    onClose();
    onLogin();
  }

  function handleLogout() {
    onClose();
    onLogout();
  }

  return (
    <div
      className="modal-overlay flex items-center justify-center bg-black/20 px-4 backdrop-blur-[3px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        className="relative flex h-[600px] max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-black/15 bg-white text-black shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-black/10 px-6 py-4">
          <h1 id={titleId} className="text-base font-bold">
            Settings
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-7 w-7 items-center justify-center rounded-full text-black/40 hover:bg-black/5 hover:text-black"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-black/10 px-3 py-3 sm:w-44 sm:flex-col sm:gap-0.5 sm:overflow-visible sm:border-b-0 sm:border-r sm:px-3 sm:py-4"
            role="tablist"
            aria-label="Settings sections"
          >
            {(
              [
                { key: "general", label: "General" },
                { key: "account", label: "Account" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => setTab(item.key)}
                className={
                  "shrink-0 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors sm:w-full " +
                  (tab === item.key
                    ? "bg-black/[0.06] text-black font-semibold"
                    : "text-black/55 hover:bg-black/5 hover:text-black")
                }
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
            {tab === "general" ? (
              <div>
                <h2 className="mb-3 text-base font-semibold">Appearance</h2>
                <DarkModeToggle showLabel />
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <h2 className="mb-1 shrink-0 text-base font-semibold">Account</h2>
                {user ? (
                  <div className="mt-3 min-h-0 flex-1">
                    <AccountSettings
                      user={user}
                      onLogout={handleLogout}
                      onDeleted={() => {
                        onClose();
                        onLogout();
                      }}
                    />
                  </div>
                ) : (
                  <div className="border-t border-black/10 pt-4">
                    <p className="mb-3 text-sm text-black/60">
                      Log in to manage your email, password, and account.
                    </p>
                    <button
                      type="button"
                      onClick={switchToLogin}
                      className="h-8 rounded-full border border-black bg-black px-4 text-xs font-semibold text-white hover:bg-white hover:text-black"
                    >
                      Log in
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
