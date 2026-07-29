"use client";

import { useEffect, useState } from "react";
import { clearLocalPrivateData } from "@/lib/auth/privateLocalData";
import { supabase } from "@/lib/supabase/client";
import { writeLastKnownSyncUserId } from "@/lib/storage/syncCache";

export default function AuthPanel({ compact = false }) {
  const [user, setUser] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let isMounted = true;
    void supabase.auth.getUser().then(({ data: { user: nextUser } }) => {
      if (isMounted) {
        setUser(nextUser || null);
        writeLastKnownSyncUserId(nextUser?.id || null);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      writeLastKnownSyncUserId(session?.user?.id || null);
      if (!session?.user) {
        clearLocalPrivateData();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!supabase) {
      return;
    }

    setIsBusy(true);
    setStatus("");
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}${basePath || ""}/`
          : undefined;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo
        }
      });
      if (error) {
        setStatus(error.message || "Unable to send sign-in link.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown auth error";
      setStatus(`Google sign-in failed: ${message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabase) {
      return;
    }

    setIsBusy(true);
    setStatus("");
    try {
      await supabase.auth.signOut();
      clearLocalPrivateData();
      setStatus("Signed out and local private data cleared.");
    } finally {
      setIsBusy(false);
    }
  };

  if (!supabase) {
    return (
      <section className={`auth-panel${compact ? " is-compact" : ""}`}>
        <p className="auth-status">Supabase not configured.</p>
      </section>
    );
  }

  if (compact) {
    return (
      <section className="auth-panel is-compact">
        <button
          type="button"
          className="auth-btn auth-btn-compact"
          disabled={isBusy}
          onClick={user ? signOut : signInWithGoogle}
          title={user?.email || "Cloud sync account"}
        >
          {isBusy ? "Working..." : user ? "Sign Out" : "Sign In"}
        </button>
      </section>
    );
  }

  return (
    <section className="auth-panel">
      <h2 className="auth-heading">Cloud Sync</h2>
      {user ? (
        <>
          <p className="auth-user">{user.email || "Signed in"}</p>
          <button
            type="button"
            className="auth-btn"
            disabled={isBusy}
            onClick={signOut}
          >
            Sign Out
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="auth-btn"
            disabled={isBusy}
            onClick={signInWithGoogle}
          >
            Sign In With Google
          </button>
        </>
      )}
      {status ? <p className="auth-status">{status}</p> : null}
    </section>
  );
}
