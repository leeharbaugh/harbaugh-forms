import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildSoftDeleteMessage } from "./soft-delete-message.ts";

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function walkTsFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === ".git" ||
      entry === "dist"
    ) {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkTsFiles(full, files);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe("ConfirmDialog polish", () => {
  const source = readSource("components/ui/confirm-dialog.tsx");

  it("places Cancel before Confirm in the action row", () => {
    const cancelIndex = source.indexOf("cancelButtonRef");
    const confirmIndex = source.indexOf("confirmButtonRef");
    const cancelRender = source.indexOf("{cancelLabel}");
    const confirmRender = source.indexOf(
      "{isConfirming ? confirmingLabel : confirmLabel}",
    );
    assert.ok(cancelIndex > 0);
    assert.ok(confirmIndex > cancelIndex);
    assert.ok(cancelRender > 0);
    assert.ok(confirmRender > cancelRender);
  });

  it("defaults destructive focus to cancel and uses alertdialog labeling", () => {
    assert.match(source, /variant === "destructive" \? "cancel"/);
    assert.match(source, /role="alertdialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /aria-labelledby/);
    assert.match(source, /aria-describedby/);
  });

  it("prevents background scroll while open", () => {
    assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  });
});

describe("InfoDialog accessibility parity", () => {
  const source = readSource("components/ui/info-dialog.tsx");

  it("supports Escape, focus trap, and dialog labeling", () => {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /aria-labelledby/);
    assert.match(source, /aria-describedby/);
    assert.match(source, /event\.key === "Escape"/);
    assert.match(source, /FOCUSABLE_SELECTOR/);
    assert.match(source, /previouslyFocusedRef/);
  });

  it("uses a white Card surface with a single primary action", () => {
    assert.match(source, /<Card/);
    assert.match(source, /confirmButtonRef/);
    assert.doesNotMatch(source, /variant="destructive"/);
  });
});

describe("soft-delete destructive copy", () => {
  it("mentions restore when canRestore is true", () => {
    const message = buildSoftDeleteMessage({
      objectType: "contact",
      itemName: "Jane Doe",
      canRestore: true,
    });
    assert.match(message, /from active use/);
    assert.match(message, /restored later/i);
    assert.doesNotMatch(message, /permanent/i);
  });

  it("does not imply permanence when restore is unavailable", () => {
    const message = buildSoftDeleteMessage({
      objectType: "packet form",
      canRestore: false,
    });
    assert.match(message, /from active use/);
    assert.doesNotMatch(message, /cannot be undone/i);
    assert.doesNotMatch(message, /permanent/i);
  });
});

describe("admin deactivate copy", () => {
  it("uses deactivate language rather than delete for users", () => {
    const users = readSource("components/admin/admin-users-page.tsx");
    assert.match(users, /Deactivate user\?/);
    assert.match(
      users,
      /no longer be able to access the application until reactivated/,
    );
  });

  it("uses deactivate language for organizations", () => {
    const orgs = readSource("components/admin/admin-organizations-page.tsx");
    assert.match(orgs, /Deactivate organization\?/);
    assert.match(orgs, /treated as inactive/);
  });
});

describe("pending-state loading labels", () => {
  it("uses clear invitation pending copy", () => {
    const users = readSource("components/admin/admin-users-page.tsx");
    assert.match(users, /Sending invitation…/);
    assert.doesNotMatch(users, /Working\.\.\./);
  });

  it("uses unicode ellipsis in shared dialog confirming labels", () => {
    const confirm = readSource("components/ui/confirm-dialog.tsx");
    const del = readSource("components/ui/confirm-delete-dialog.tsx");
    assert.match(confirm, /Working…/);
    assert.match(del, /Deleting…/);
  });
});

describe("semantic status-message classes", () => {
  it("admin success messages use text-success", () => {
    for (const file of [
      "components/admin/admin-users-page.tsx",
      "components/admin/admin-user-detail-page.tsx",
      "components/admin/admin-organizations-page.tsx",
      "components/admin/admin-organization-detail-page.tsx",
      "components/collections/collections-page.tsx",
    ]) {
      const source = readSource(file);
      assert.match(source, /text-success/);
      assert.doesNotMatch(source, /text-emerald-700/);
    }
  });
});

describe("browser confirm/alert absence", () => {
  it("does not use window.confirm or window.alert in app sources", () => {
    const roots = ["app", "components", "lib"];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walkTsFiles(join(process.cwd(), root))) {
        if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) {
          continue;
        }
        const source = readFileSync(file, "utf8");
        if (/\bwindow\.confirm\b|\bwindow\.alert\b/.test(source)) {
          offenders.push(file);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe("greeting narrow-width behavior", () => {
  it("AuthButton truncates greeting on narrow screens", () => {
    const source = readSource("components/auth-button.tsx");
    assert.match(source, /max-w-\[14rem]/);
    assert.match(source, /truncate/);
    assert.match(source, /sm:max-w-none/);
    assert.match(source, /formatSignedInGreeting/);
  });
});
