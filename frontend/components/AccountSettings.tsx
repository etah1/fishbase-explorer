"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const inputClass =
  "h-9 w-full rounded-lg border border-black/20 bg-white px-3 text-sm text-black outline-none focus:border-[#1b7cb2] focus:ring-2 focus:ring-[#9fd1ff]";

export default function AccountSettings({
  user,
  onLogout,
  onDeleted,
}: {
  user: User;
  onLogout: () => void;
  onDeleted: () => void;
}) {
  const [email, setEmail] = useState(user.email ?? "");
  const [displayName, setDisplayName] = useState(
    typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : ""
  );
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [displayNameStatus, setDisplayNameStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function changeDisplayName(event: React.FormEvent) {
    event.preventDefault();
    setDisplayNameStatus("");
    setSavingDisplayName(true);
    const normalizedName = displayName.trim();
    const supabase = createClient();
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { display_name: normalizedName },
    });
    if (metadataError) {
      setSavingDisplayName(false);
      setDisplayNameStatus(metadataError.message);
      return;
    }

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setSavingDisplayName(false);
      setDisplayNameStatus("Display name saved, but your session expired before past submissions could be updated.");
      return;
    }

    try {
      const response = await fetch(`${API}/account/display-name`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ display_name: normalizedName }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? "Unable to update past submissions.");
      setDisplayNameStatus(normalizedName ? "Display name updated." : "Display name removed.");
    } catch (error) {
      setDisplayNameStatus(error instanceof Error ? error.message : "Unable to update display name.");
    } finally {
      setSavingDisplayName(false);
    }
  }

  async function changeEmail(event: React.FormEvent) {
    event.preventDefault();
    setEmailStatus("");
    setSavingEmail(true);
    const { error } = await createClient().auth.updateUser({ email });
    setSavingEmail(false);
    setEmailStatus(
      error
        ? error.message
        : "Confirmation links were sent. Follow them to finish changing your email.",
    );
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordStatus("");
    if (password !== passwordConfirmation) {
      setPasswordStatus("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    const { error } = await createClient().auth.updateUser({ password });
    setSavingPassword(false);
    if (error) {
      setPasswordStatus(error.message);
      return;
    }
    setPassword("");
    setPasswordConfirmation("");
    setPasswordStatus("Password updated.");
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError("");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setDeleting(false);
      setDeleteError("Your session expired. Please log in again.");
      return;
    }

    try {
      const response = await fetch(API + "/account", {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail ?? "Unable to delete account.");
      await supabase.auth.signOut();
      onDeleted();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete account.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        <form onSubmit={changeDisplayName} className="space-y-2 pb-4">
          <label className="block text-xs font-semibold" htmlFor="account-display-name">
            Display name
          </label>
          <div className="flex gap-2">
            <input
              id="account-display-name"
              type="text"
              maxLength={60}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Name shown with your submissions"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={savingDisplayName}
              className="h-9 shrink-0 rounded-full border border-black px-4 text-xs font-semibold hover:bg-black hover:text-white disabled:opacity-40"
            >
              {savingDisplayName ? "Saving..." : "Save"}
            </button>
          </div>
          <p className="text-xs text-black/55">
            This name is public and appears with approved submissions.
          </p>
          {displayNameStatus && <p className="text-xs text-black/55">{displayNameStatus}</p>}
        </form>

        <form onSubmit={changeEmail} className="space-y-2 border-t border-black/10 pt-4 pb-4">
          <label className="block text-xs font-semibold" htmlFor="account-email">
            Email
          </label>
          <div className="flex gap-2">
            <input
              id="account-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={savingEmail || email === user.email}
              className="h-9 shrink-0 rounded-full border border-black px-4 text-xs font-semibold hover:bg-black hover:text-white disabled:opacity-40"
            >
              {savingEmail ? "Saving..." : "Update"}
            </button>
          </div>
          {emailStatus && <p className="text-xs text-black/55">{emailStatus}</p>}
        </form>

        <form onSubmit={changePassword} className="space-y-2 border-t border-black/10 pt-4 pb-4">
          <label className="block text-xs font-semibold">New password</label>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="password"
              required
              minLength={6}
              placeholder="New password"
              aria-label="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Confirm password"
              aria-label="Confirm password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              className={inputClass}
            />
          </div>
          {passwordStatus && <p className="text-xs text-black/55">{passwordStatus}</p>}
          <button
            type="submit"
            disabled={savingPassword || !password || !passwordConfirmation}
            className="h-9 rounded-full border border-black px-4 text-xs font-semibold hover:bg-black hover:text-white disabled:opacity-40"
          >
            {savingPassword ? "Saving..." : "Update password"}
          </button>
        </form>

        {deleteError && <p className="text-xs text-red-700">{deleteError}</p>}
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-end gap-2 border-t border-black/10 pt-3">
        {confirmDelete ? (
          <>
            <span className="mr-auto text-xs text-black/60">Delete your account permanently?</span>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="h-8 rounded-full border border-black/30 px-4 text-xs font-semibold hover:border-black disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={deleting}
              className="h-8 rounded-full bg-red-700 px-4 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-40"
            >
              {deleting ? "Deleting..." : "Yes, delete"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onLogout}
              className="h-8 rounded-full border border-black px-4 text-xs font-semibold hover:bg-black hover:text-white"
            >
              Log out
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-8 rounded-full bg-red-700 px-4 text-xs font-semibold text-white hover:bg-red-800"
            >
              Delete Account
            </button>
          </>
        )}
      </div>
    </div>
  );
}
