"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeLogin } from "@/lib/spotify/auth";
import { ErrorScreen, LoadingNotes, StatusScreen } from "@/components/StatusScreen";

export default function Callback() {
  const router = useRouter();
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

  if (error) return <ErrorScreen title="Couldn't connect Spotify" message={error} primary={{ label: "Back", run: () => router.push("/") }} />;
  return (
    <StatusScreen>
      <LoadingNotes message="Connecting Spotify" />
    </StatusScreen>
  );
}
