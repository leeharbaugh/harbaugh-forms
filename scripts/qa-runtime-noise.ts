/**
 * Browser QA runtime-noise guard: fails on any browser console error/warning,
 * uncaught page error, or local Next dev server ERROR/WARN log line emitted
 * while the QA run is in progress. There is deliberately no allowlist.
 *
 * Server lines come from the running dev server's structured log
 * (`.next/dev/logs/next-development.log`); lines already present when the run
 * starts are ignored.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "playwright";

const DEV_LOG = path.join(".next", "dev", "logs", "next-development.log");

function logLines(): string[] {
  return existsSync(DEV_LOG) ? readFileSync(DEV_LOG, "utf8").split(/\r?\n/) : [];
}

export function createRuntimeNoiseGuard() {
  const browserIssues: string[] = [];
  const serverStart = logLines().length;

  return {
    watch(page: Page, label: string) {
      page.on("console", (message) => {
        const type = message.type();
        if (type === "error" || type === "warning") {
          browserIssues.push(`[${label}] console.${type}: ${message.text().slice(0, 400)}`);
        }
      });
      page.on("pageerror", (error) => {
        browserIssues.push(`[${label}] pageerror: ${error.message.slice(0, 400)}`);
      });
    },
    /** Every unexpected browser or server message so far. */
    issues(): string[] {
      const serverIssues = logLines()
        .slice(serverStart)
        .filter((line) => /"level":"(ERROR|WARN)"/.test(line))
        .map((line) => `[server] ${line.slice(0, 400)}`);
      return [...browserIssues, ...serverIssues];
    },
  };
}
