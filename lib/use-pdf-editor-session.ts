"use client";

import { acquirePdfWorker, releasePdfWorker } from "@/lib/pdfjs-setup";
import { useCallback, useEffect, useRef, useState } from "react";

export type PdfEditorLoadRequest = {
  id: number;
  isCurrent: () => boolean;
};

/** Worker lifecycle + deferred PDF mount for react-pdf editors. */
export function usePdfEditorSession(pdfUrl: string | null, isLoading: boolean) {
  const loadRequestIdRef = useRef(0);
  const [documentSession, setDocumentSession] = useState(0);
  const [isPdfRenderReady, setIsPdfRenderReady] = useState(false);

  useEffect(() => {
    acquirePdfWorker();

    return () => {
      loadRequestIdRef.current += 1;
      setIsPdfRenderReady(false);
      releasePdfWorker();
    };
  }, []);

  useEffect(() => {
    if (!pdfUrl || isLoading) {
      setIsPdfRenderReady(false);
      return;
    }

    let cancelled = false;
    const frameId = window.requestAnimationFrame(() => {
      if (!cancelled) {
        setIsPdfRenderReady(true);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      setIsPdfRenderReady(false);
    };
  }, [pdfUrl, isLoading, documentSession]);

  const beginLoadRequest = useCallback((): PdfEditorLoadRequest => {
    const id = ++loadRequestIdRef.current;
    return {
      id,
      isCurrent: () => id === loadRequestIdRef.current,
    };
  }, []);

  const prepareFullScreenLoad = useCallback(() => {
    setIsPdfRenderReady(false);
    setDocumentSession((session) => session + 1);
  }, []);

  return {
    beginLoadRequest,
    prepareFullScreenLoad,
    documentSession,
    isPdfRenderReady,
    documentKey: String(documentSession),
  };
}
