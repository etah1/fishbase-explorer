"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import LoginModal from "@/components/LoginModal";
import SettingsModal from "@/components/SettingsModal";
import { createClient } from "@/utils/supabase/client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const links = [
  { href: "/", label: "Browse" },
  { href: "/tree", label: "Phylogeny" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    function applySession(session: { user: User; access_token: string } | null) {
      setUser(session?.user ?? null);
      if (!session) {
        setIsAdmin(false);
        return;
      }
      fetch(`${API}/admin/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => setIsAdmin(body?.is_admin === true))
        .catch(() => setIsAdmin(false));
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const navLinks = user
    ? [
        ...links,
        { href: "/contribute", label: "Contribute" },
        ...(isAdmin ? [{ href: "/admin/review", label: "Admin" }] : []),
      ]
    : links;

  return (
    <>
    <nav className="w-full px-4 text-black sm:px-4 lg:px-8">
      <div className="nav-blue-divider mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-b-2xl border bg-white/90 px-3 py-1.5 text-black shadow-xl shadow-[#2f4a57]/10 backdrop-blur sm:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-black">
          <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-xl nav-blue-divider border bg-white">
            <Image className="brand-logo object-cover" src="/icon.svg" alt="" fill sizes="28px" priority />
          </span>
          <span className="truncate text-sm font-bold tracking-tight">Cichlid Explorer</span>
        </Link>

        <div className="hidden flex-1 items-center justify-center gap-4 sm:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-xs font-semibold transition-colors ${
                  active ? "text-black" : "text-black/45 hover:text-black"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 sm:hidden">
            {navLinks.map((link) => {
              const active = pathname === link.href;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-black text-white"
                      : "text-black/55 hover:bg-black/5 hover:text-black"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          <span className="nav-blue-divider hidden h-5 border-l sm:block" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="hidden text-xs font-semibold text-black/45 hover:text-black sm:block"
          >
            Settings
          </button>
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="hidden text-xs font-semibold text-black/45 hover:text-black sm:block"
              title={user.email}
            >
              Log out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="hidden text-xs font-semibold text-black/45 hover:text-black sm:block"
            >
              Log in
            </button>
          )}
        </div>
      </div>
    </nav>
    <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    <SettingsModal
        open={settingsOpen}
        user={user}
        onClose={() => setSettingsOpen(false)}
        onLogin={() => setLoginOpen(true)}
        onLogout={handleLogout}
    />
    </>
  );
}
