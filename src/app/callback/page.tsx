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
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5">
      <header className="flex h-14 items-center">
        <Logo className="text-lg" />
      </header>
      <div className="flex flex-1 flex-col justify-center pb-24">
        {error ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight">Spotify didn&apos;t connect.</h1>
            <p className="mt-3 text-ink-2">{error}</p>
            <a href="/" className="mt-6 font-semibold underline decoration-rule-strong underline-offset-4 hover:decoration-ink">
              Back to Earshot
            </a>
          </>
        ) : (
          <p className="text-[15px]">
            Connecting to Spotify <Spinner className="ml-1" />
          </p>
        )}
      </div>
    </div>
  );
}
