"use client";

import { useEffect, useState } from "react";
import AriadnePublicSite from "@/components/AriadnePublicSite";
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
      if (!isMounted) return;

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
          if (isMounted) setAccessState("signed-out");
          return;
        }
        applyUser(data?.user || null);
      })
      .catch(() => {
        clearLocalPrivateData();
        if (isMounted) setAccessState("unavailable");
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
    if (!supabase || isBusy) return;

    setIsBusy(true);
    setMessage("");
    clearLocalPrivateData();

    try {
      if (accessState === "denied") {
        await supabase.auth.signOut();
        setAccessState("signed-out");
      }

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

  if (accessState === "authorized") {
    return children;
  }

  const isDenied = accessState === "denied";
  const isUnavailable = accessState === "unavailable";
  const authMessage =
    message ||
    (isDenied
      ? "This Google account is not authorized to use the private Ariadne workspace. Choose another account to continue."
      : isUnavailable
        ? "Secure sign-in is currently unavailable. The public Ariadne surface remains available."
        : "");

  return (
    <AriadnePublicSite
      onSignIn={signIn}
      isSigningIn={isBusy}
      signInAvailable={!isUnavailable}
      signInLabel={isDenied ? "Use Another Account" : "Sign In"}
      authMessage={authMessage}
    />
  );
}
