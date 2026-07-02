"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DarkModeToggle from "@/components/DarkModeToggle";

const links = [
  { href: "/tree", label: "Phylogeny" },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="w-full px-4 pt-4 text-black sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 rounded-full nav-blue-divider border bg-white/90 px-3 py-1.5 shadow-md shadow-[#2f4a57]/10 backdrop-blur">
        <Link href="/" className="flex min-w-0 items-center gap-2 nav-blue-divider border-r pr-4 text-black">
          <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full nav-blue-divider border bg-white">
            <Image className="brand-logo object-cover" src="/icon.svg" alt="" fill sizes="32px" priority />
          </span>
          <span className="truncate text-sm font-bold sm:text-base">Cichlid Explorer</span>
        </Link>

        <div className="flex flex-1 items-center justify-end gap-2">
          <div className="flex items-center gap-1 nav-blue-divider border-l pl-3">
            {links.map((link) => {
              const active = pathname === link.href;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-black text-white"
                      : "text-black hover:bg-white hover:text-black"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          <DarkModeToggle />
        </div>
      </div>
    </nav>
  );
}



