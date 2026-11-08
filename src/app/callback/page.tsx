"use client";

import { useEffect, useState } from "react";
import { completeLogin } from "@/lib/spotify/auth";
import { Logo, Spinner } from "@/components/ui";

export default function Callback() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    const code = params.get("code");
    const state = params.get("state");
    if (err || !code || !state) {
      setError(err === "access_denied" ? "You cancelled the Spotify login." : err || "Missing login code.");
      return;
    }
    completeLogin(code, state)
      .then((to) => window.location.replace(to || "/"))
      .catch((e: Error) => setError(e.message));
  }, []);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo className="text-xl" />
      {error ? (
        <div>
          <p className="text-bad">{error}</p>
          <a href="/" className="mt-4 inline-block text-dim underline underline-offset-4 hover:text-fg">
            Back to Earshot
          </a>
        </div>
      ) : (
        <p className="flex items-center gap-3 text-dim">
          <Spinner /> Connecting to Spotify
        </p>
      )}
    </div>
  );
}
