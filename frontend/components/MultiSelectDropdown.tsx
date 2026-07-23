"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Option = { key: string; label: string };

type MultiSelectDropdownProps = {
  options: Option[];
  selected: string[];
  onChange: (keys: string[]) => void;
  placeholder: string;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  showSelectAll?: boolean;
};

const MAX_VISIBLE_OPTIONS = 50;

// Match each term against a word start to support abbreviated and complete names.
function matchesWordStart(label: string, query: string): boolean {
  const words = label.toLowerCase().split(/\s+/);
  const terms = query.split(/\s+/);
  return terms.every((term) => words.some((word) => word.startsWith(term)));
}

export default function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  className,
  searchable = false,
  searchPlaceholder = "Type to search...",
  showSelectAll = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function closeDropdown() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeDropdown();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeDropdown();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }

  const selectedLabels = options.filter((o) => selected.includes(o.key)).map((o) => o.label);
  const summary =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.length} selected`;

  const trimmedQuery = query.trim().toLowerCase();
  const matchedOptions = useMemo(() => {
    if (!searchable) return options;
    return trimmedQuery
      ? options.filter((o) => matchesWordStart(o.label, trimmedQuery))
      : options;
  }, [searchable, options, trimmedQuery]);
  const visibleOptions = matchedOptions.slice(0, MAX_VISIBLE_OPTIONS);
  const truncated = searchable && matchedOptions.length > MAX_VISIBLE_OPTIONS;
  const allSelected = options.length > 0 && options.every((option) => selected.includes(option.key));

  return (
    <div ref={rootRef} className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => (open ? closeDropdown() : setOpen(true))}
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-full border border-black bg-white px-3 text-xs font-medium text-black shadow-sm hover:bg-blue-50"
      >
        {summary}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-black bg-white p-1 shadow-lg">
          {searchable && (
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="mb-1 h-7 w-full rounded-md border border-black px-2 text-xs text-black placeholder:text-slate-500 focus:outline-none"
            />
          )}
          {showSelectAll && options.length > 0 && (
            <button
              type="button"
              onClick={() => onChange(allSelected ? [] : options.map((option) => option.key))}
              className="mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-black hover:bg-blue-50"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          )}
          <div className="max-h-64 overflow-y-auto">
            {visibleOptions.map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-black hover:bg-blue-50"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.key)}
                  onChange={() => toggle(option.key)}
                />
                {option.label}
              </label>
            ))}
            {searchable && visibleOptions.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-slate-500">
                {trimmedQuery ? "No matches." : "Type to search, or pick from your selection."}
              </p>
            )}
            {truncated && (
              <p className="px-2 py-1.5 text-xs text-slate-500">
                {MAX_VISIBLE_OPTIONS}+ matches. Keep typing to narrow it down.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



