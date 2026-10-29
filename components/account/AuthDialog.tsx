"use client";

import { useState } from "react";
import { CloudUpload } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { useCloud } from "@/lib/cloud";
import { Modal } from "./Modal";

type Mode = "sign-in" | "sign-up";

/** Turn an auth failure (returned or thrown, depending on status) into a readable message. */
function authMessage(err: unknown, mode: Mode): string {
  const e = (err ?? {}) as { status?: number; message?: string; code?: string };
  if (e.status === 0 || err instanceof TypeError) return "Couldn’t reach the sign-in service. Check your connection.";
  if (mode === "sign-in" && (e.status === 401 || e.status === 403 || e.code === "INVALID_EMAIL_OR_PASSWORD")) return "Wrong email or password.";
  if (e.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (e.message) return e.message;
  return mode === "sign-up" ? "Couldn’t create your account." : "Couldn’t sign you in. Try again.";
}

const fieldCls =
  "h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-[13.5px] text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-900/5";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.2-2.1 3.5-5.2 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.7-4.9h-4v3.1C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.6.4-2.4V6.5h-4C.5 8.2 0 10 0 12s.5 3.8 1.3 5.5l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.3 0 3.3 2.7 1.3 6.5l4 3.1c1-2.8 3.6-4.8 6.7-4.8z" />
    </svg>
  );
}

export function AuthDialog() {
  const close = useCloud((s) => s.closeDialog);
  const saveAfterAuth = useCloud((s) => s.saveAfterAuth);
  const [mode, setMode] = useState<Mode>("sign-up");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = authClient.useSession();

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    setError(null);
    setPending(true);
    try {
      const { error: err } =
        mode === "sign-up"
          ? await authClient.signUp.email({ email, password, name: name || email.split("@")[0] })
          : await authClient.signIn.email({ email, password });
      if (err) {
        setError(authMessage(err, mode));
        return;
      }
      // The session hook picks up the new session; SessionSync then runs the pending save.
      await session.refetch();
    } catch (err) {
      setError(authMessage(err, mode));
    } finally {
      setPending(false);
    }
  };

  const google = async () => {
    setError(null);
    // Return to the planner; the pending-save flag doesn't survive the redirect, so the user saves again.
    try {
      const { error: err } = await authClient.signIn.social({ provider: "google", callbackURL: window.location.origin });
      if (err) setError(authMessage(err, "sign-in"));
    } catch (err) {
      setError(authMessage(err, "sign-in"));
    }
  };

  return (
    <Modal title={mode === "sign-up" ? "Create an account" : "Sign in"} onClose={close}>
      <div className="px-6 pt-6 pb-5">
        <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-stone-100">
          <CloudUpload className="size-5 text-stone-600" />
        </div>
        <h2 className="text-[16px] font-semibold text-stone-900">{mode === "sign-up" ? "Save your plan to an account" : "Welcome back"}</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-stone-500">
          {saveAfterAuth
            ? "You don’t need an account to plan. Sign in to keep this room safe and open it on any device. We’ll save it as soon as you’re in."
            : "Sign in to open your saved plans on any device."}
        </p>

        <button
          type="button"
          onClick={google}
          className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-medium text-stone-800 ring-1 ring-stone-200 transition hover:bg-stone-50"
        >
          <GoogleMark /> Continue with Google
        </button>
        <div className="my-4 flex items-center gap-3 text-[11px] text-stone-400">
          <span className="h-px flex-1 bg-stone-200" /> or with email <span className="h-px flex-1 bg-stone-200" />
        </div>

        <form onSubmit={submit} className="space-y-2.5">
          {mode === "sign-up" && <input name="name" autoComplete="name" placeholder="Name (optional)" aria-label="Name" className={fieldCls} />}
          <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" className={fieldCls} />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            placeholder={mode === "sign-up" ? "Password (8+ characters)" : "Password"}
            aria-label="Password"
            className={fieldCls}
          />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700 ring-1 ring-red-100">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-stone-900 text-[13px] font-medium text-white transition hover:bg-stone-700 disabled:opacity-60"
          >
            {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {mode === "sign-up" ? (saveAfterAuth ? "Create account and save" : "Create account") : saveAfterAuth ? "Sign in and save" : "Sign in"}
          </button>
        </form>
      </div>
      <div className="rounded-b-2xl border-t border-stone-100 bg-stone-50 px-6 py-3 text-center text-[12.5px] text-stone-500">
        {mode === "sign-up" ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-up" ? "sign-in" : "sign-up");
            setError(null);
          }}
          className="font-medium text-stone-900 underline-offset-2 hover:underline"
        >
          {mode === "sign-up" ? "Sign in" : "Create an account"}
        </button>
      </div>
    </Modal>
  );
}
