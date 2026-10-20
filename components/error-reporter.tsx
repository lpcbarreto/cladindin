"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const onError = (e: ErrorEvent) => sent++ < 5 && reportError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => sent++ < 5 && reportError(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
