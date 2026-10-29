"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { classifyLoginError } from "@/lib/auth/login-error";

// Supabase sometimes reports a refused login in the URL fragment, which the server
// never sees. Turn it into the same ?fout= code the callback route uses.
export function HashError() {
  const router = useRouter();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const error = hash.get("error");
    if (error) {
      router.replace(`/login?fout=${classifyLoginError(error, hash.get("error_description"))}`);
    }
  }, [router]);

  return null;
}
