"use client";

import { useEffect, useState } from "react";
import { isAuthorizedAppUser } from "@/lib/auth/access";
import { clearLocalPrivateData } from "@/lib/auth/privateLocalData";
import { supabase } from "@/lib/supabase/client";

export default function AppAccessGate({ children }) {
  const [accessState, setAccessState] = useState("checking");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      clearLocalPrivateData();
      setAccessState("unavailable");
      return undefined;
    }

    let isMounted = true;

    const applyUser = (user) => {
      if (!isMounted) {
        return;
      }

      if (isAuthorizedAppUser(user)) {
        setAccessState("authorized");
        setMessage("");
        return;
      }

      clearLocalPrivateData();
      setAccessState(user ? "denied" : "signed-out");
    };

    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (error) {
          clearLocalPrivateData();
          if (isMounted) {
            setAccessState("signed-out");
          }
          return;
        }
        applyUser(data?.user || null);
      })
      .catch(() => {
        clearLocalPrivateData();
        if (isMounted) {
          setAccessState("unavailable");
        }
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user || null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async () => {
    if (!supabase || isBusy) {
      return;
    }

    setIsBusy(true);
    setMessage("");
    try {
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const redirectTo =
        typeof window === "undefined"
          ? undefined
          : `${window.location.origin}${basePath || ""}/`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account"
          }
        }
      });
      if (error) {
        setMessage("Sign-in could not be started.");
      }
    } catch {
      setMessage("Sign-in could not be started.");
    } finally {
      setIsBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabase || isBusy) {
      return;
    }

    setIsBusy(true);
    setMessage("");
    clearLocalPrivateData();
    try {
      await supabase.auth.signOut();
      setAccessState("signed-out");
    } catch {
      setMessage("Sign-out failed. Reload this page before trying again.");
    } finally {
      setIsBusy(false);
    }
  };

  if (accessState === "authorized") {
    return children;
  }

  if (accessState === "checking") {
    return (
      <main className="access-gate" aria-busy="true">
        <p className="access-gate-status">Checking access...</p>
      </main>
    );
  }

  const isDenied = accessState === "denied";
  const isUnavailable = accessState === "unavailable";

  return (
    <main className="access-gate">
      <section className="access-gate-panel" aria-labelledby="access-gate-title">
        <div className="access-gate-mark" aria-hidden="true">F</div>
        <h1 id="access-gate-title">
          {isDenied ? "Access denied" : isUnavailable ? "Access unavailable" : "Sign in"}
        </h1>
        <p>
          {isDenied
            ? "This Google account is not authorized to use this workspace."
            : isUnavailable
              ? "Secure sign-in is currently unavailable."
              : "Authentication is required to continue."}
        </p>
        {isDenied ? (
          <button type="button" className="access-gate-button" onClick={signOut} disabled={isBusy}>
            {isBusy ? "Signing out..." : "Use another account"}
          </button>
        ) : !isUnavailable ? (
          <button type="button" className="access-gate-button" onClick={signIn} disabled={isBusy}>
            {isBusy ? "Opening sign-in..." : "Sign in with Google"}
          </button>
        ) : null}
        {message ? <p className="access-gate-message" role="status">{message}</p> : null}
      </section>
    </main>
  );
}
