const fs = require("fs");
const path = require("path");

const source = path.join(
  __dirname,
  "node_modules",
  "pdfjs-dist",
  "build",
  "pdf.worker.min.mjs",
);
const destination = path.join(__dirname, "public", "pdf.worker.min.mjs");

if (!fs.existsSync(source)) {
  console.warn(
    "[copy-pdf-worker] pdfjs-dist worker not found; skip copying pdf.worker.min.mjs",
  );
  process.exit(0);
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
console.log("[copy-pdf-worker] Copied pdf.worker.min.mjs to public/");
