"use client";

import { pdfjs } from "react-pdf";

/** Same-origin worker served from /public (see scripts/copy-pdf-worker.js). */
const PDF_WORKER_URL = "/pdf.worker.min.mjs";

let pdfWorkerRefCount = 0;

/** Ensure the pdf.js worker is configured for editor sessions. */
export function acquirePdfWorker(): void {
  if (typeof window === "undefined") {
    return;
  }

  pdfWorkerRefCount += 1;

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  }
}

/** Track editor session teardown (worker stays alive for reuse). */
export function releasePdfWorker(): void {
  if (typeof window === "undefined") {
    return;
  }

  pdfWorkerRefCount = Math.max(0, pdfWorkerRefCount - 1);
}
