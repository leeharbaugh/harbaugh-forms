import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HELP_EMAIL_DISPLAY,
  HELP_EMAIL_HREF,
  HELP_PAGE_PATH,
  HELP_PHONE_DISPLAY,
  HELP_PHONE_HREF,
  getGettingStartedSteps,
  helpStepLinks,
  helpStepPlainText,
} from "./getting-started.ts";
import { isPathAllowedDuringDeviceHandoffLock } from "../signing/device-handoff-lock.ts";
import { isParticipantSigningPath } from "../signing/bearer-transport.ts";
import { isInternalSigningWorkerPath } from "../signing/internal-worker-routes.ts";
import { NO_COLLECTIONS_MESSAGE } from "../types/packet-workflow.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const WORKSPACE_SURFACES = [
  "app/page.tsx",
  "app/contacts/layout.tsx",
  "app/properties/layout.tsx",
  "app/forms/layout.tsx",
  "app/collections/layout.tsx",
  "app/packets/layout.tsx",
  "app/settings/layout.tsx",
  "app/signings/layout.tsx",
  "app/admin/layout.tsx",
  "app/help/layout.tsx",
  "app/representation-agreements/layout.tsx",
  "app/form-field-mappings/layout.tsx",
];

const ALLOWED_STEP_HREFS = new Set([
  "/settings",
  "/contacts",
  "/properties",
  "/forms",
  "/collections",
  "/",
  "/signings",
]);

describe("Help page access", () => {
  it("is an authenticated workspace route behind the existing login check", () => {
    const page = readRepo("app/help/page.tsx");
    const layout = readRepo("app/help/layout.tsx");
    const proxy = readRepo("lib/supabase/proxy.ts");

    assert.match(page, /HelpGettingStarted/);
    assert.match(page, /isNativeSigningEnabled\(\)/);
    assert.doesNotMatch(page, /redirect\(/);
    assert.match(layout, /<AppNav active="help" \/>/);
    assert.equal(HELP_PAGE_PATH, "/help");

    assert.equal(isParticipantSigningPath("/help"), false);
    assert.equal(isInternalSigningWorkerPath("/help"), false);
    assert.equal(isPathAllowedDuringDeviceHandoffLock("/help"), false);
    assert.match(proxy, /!request\.nextUrl\.pathname\.startsWith\("\/auth"\)/);
    assert.match(proxy, /!request\.nextUrl\.pathname\.startsWith\("\/login"\)/);
    assert.doesNotMatch(proxy, /\/help/);
    assert.equal("/help".startsWith("/auth"), false);
    assert.equal("/help".startsWith("/login"), false);
  });

  it("keeps Help on every workspace surface and off participant Signing pages", () => {
    for (const path of WORKSPACE_SURFACES) {
      assert.match(readRepo(path), /AppNav/, path);
    }
    assert.doesNotMatch(readRepo("app/sign/layout.tsx"), /AppNav/);
    assert.doesNotMatch(readRepo("app/auth/login/page.tsx"), /AppNav/);
  });
});

describe("Help navigation", () => {
  it("places a keyboard-focusable Help link in the fixed account area", () => {
    const nav = readRepo("components/app-nav.tsx");
    const scrolling = nav.indexOf("overflow-x-auto");
    const scrollingEnd = nav.indexOf("</div>", scrolling);
    const help = nav.indexOf('href="/help"');

    assert.ok(scrolling > 0);
    assert.ok(scrollingEnd > scrolling);
    assert.ok(help > scrollingEnd);
    assert.match(nav, /navLinkClass\(active === "help"\)/);
    assert.match(
      nav,
      /aria-current=\{active === "help" \? "page" : undefined\}/,
    );
    assert.match(nav, />\s*Help\s*</);
    assert.match(nav, /min-w-0 flex-1/);
    assert.doesNotMatch(nav, /min-w-\[6\.5rem\]/);
    assert.match(nav, /sm:shrink-0/);
  });

  it("lets the account name shrink so Help and Logout stay on a narrow bar", () => {
    const auth = readRepo("components/auth-button.tsx");
    assert.match(auth, /min-w-0 truncate/);
    assert.match(auth, /max-\[359px\]:sr-only/);
    assert.match(auth, /shrink-0/);
    assert.match(auth, /<LogoutButton \/>/);
    assert.match(auth, /aria-label=\{greeting\}/);
  });
});

describe("Getting Started content", () => {
  it("links ordinary pages and never admin-only pages", () => {
    for (const enabled of [false, true]) {
      const links = helpStepLinks(getGettingStartedSteps(enabled));
      assert.ok(links.length > 0);
      for (const item of links) {
        assert.ok(item.label.trim().length > 0, item.href);
        assert.equal(ALLOWED_STEP_HREFS.has(item.href), true, item.href);
        assert.equal(item.href.startsWith("/admin"), false);
        assert.equal(item.label.toLowerCase().includes("click here"), false);
      }
    }
  });

  it("uses My Agent Profile and the shared Brokerage Profile", () => {
    const copy = helpStepPlainText(getGettingStartedSteps(false));
    assert.match(copy, /My Agent Profile/);
    assert.match(copy, /Brokerage Profile/);
    assert.match(copy, /your own name, license number, phone, and email/);
    assert.match(copy, /brokerage administrator updates it/);
    assert.match(copy, /shared by everyone in the brokerage/);
    assert.doesNotMatch(copy, /brokerage_settings|user_agent_settings|database|feature gate/i);
  });

  it("uses the live page names, including Forms and Collections", () => {
    const copy = helpStepPlainText(getGettingStartedSteps(false));
    assert.match(copy, /Form Templates/);
    assert.match(copy, /Packet Templates/);
    assert.match(copy, /Adding your own form is optional/);
    assert.match(copy, /Creating your own packet template is optional/);
    assert.match(copy, /Map Fields/);
    assert.match(copy, /Publish Form/);
    assert.match(copy, /Create packet/);
    assert.match(copy, /Buyer Rep/);
    assert.match(copy, /Fill form/);
    assert.match(copy, /Refresh Values/);
    assert.match(copy, /Download PDF/);
    assert.match(copy, /Download All Forms/);
  });

  it("shows Native Signing instructions only when the feature is enabled", () => {
    const off = helpStepPlainText(getGettingStartedSteps(false));
    const on = helpStepPlainText(getGettingStartedSteps(true));
    const offHrefs = helpStepLinks(getGettingStartedSteps(false)).map(
      (item) => item.href,
    );
    const onHrefs = helpStepLinks(getGettingStartedSteps(true)).map(
      (item) => item.href,
    );

    assert.equal(getGettingStartedSteps(false).length, 7);
    assert.equal(getGettingStartedSteps(true).length, 9);
    assert.equal(offHrefs.includes("/signings"), false);
    assert.equal(onHrefs.includes("/signings"), true);
    assert.doesNotMatch(off, /Create Signing|Prepare Documents|Begin In-Person Signing|Use this Packet/);
    assert.match(on, /Create Signing/);
    assert.match(on, /Use this Packet/);
    assert.match(on, /Prepare Documents/);
    assert.match(on, /Begin In-Person Signing/);
    assert.match(on, /Audit certificate/);
    assert.match(on, /Combined signed package/);
    assert.doesNotMatch(on, /Native Signing/);
  });

  it("publishes the support phone and email as tel and mailto links", () => {
    assert.equal(HELP_PHONE_DISPLAY, "817-881-4768");
    assert.equal(HELP_PHONE_HREF, "tel:817-881-4768");
    assert.equal(HELP_EMAIL_DISPLAY, "lee@harbaughbrothers.com");
    assert.equal(HELP_EMAIL_HREF, "mailto:lee@harbaughbrothers.com");

    const page = readRepo("components/help/help-getting-started.tsx");
    assert.match(page, /href=\{HELP_PHONE_HREF\}/);
    assert.match(page, /\{HELP_PHONE_DISPLAY\}/);
    assert.match(page, /href=\{HELP_EMAIL_HREF\}/);
    assert.match(page, /\{HELP_EMAIL_DISPLAY\}/);
    assert.match(page, /Phone: /);
    assert.match(page, /Email: /);
  });
});

describe("Help accessibility", () => {
  it("uses a heading hierarchy, an ordered list, and focusable links", () => {
    const page = readRepo("components/help/help-getting-started.tsx");
    assert.match(page, /<h1[^>]*>\s*Help & Getting Started\s*<\/h1>/);
    assert.match(page, /<h2[\s\S]*Getting started[\s\S]*<\/h2>/);
    assert.match(page, /<h2[\s\S]*Need Help\?[\s\S]*<\/h2>/);
    assert.match(page, /<ol /);
    assert.match(page, /<h3 /);
    assert.match(page, /aria-labelledby="getting-started-heading"/);
    assert.match(page, /aria-labelledby="need-help-heading"/);
    assert.match(page, /focus-visible:ring-2/);
    assert.doesNotMatch(page, /overflow-x-auto/);
    assert.doesNotMatch(page, /click here/i);
  });
});

describe("Help does not change packet, form, or Signing behavior", () => {
  it("only corrects the empty-collection instruction to the current menu", () => {
    assert.equal(
      NO_COLLECTIONS_MESSAGE,
      "Add a packet template under Collections first.",
    );
    const wizard = readRepo(
      "components/packets/create-packet-from-collection-form.tsx",
    );
    assert.match(wizard, /\{NO_COLLECTIONS_MESSAGE\}/);
    assert.doesNotMatch(
      readRepo("lib/types/packet-workflow.ts"),
      /Forms → Collections/,
    );
  });

  it("does not call packet, form, or Signing actions from Help", () => {
    for (const path of [
      "app/help/page.tsx",
      "app/help/layout.tsx",
      "components/help/help-getting-started.tsx",
      "lib/help/getting-started.ts",
    ]) {
      const source = readRepo(path);
      assert.doesNotMatch(source, /@\/lib\/signing\/actions/, path);
      assert.doesNotMatch(source, /createDraftSigningAction/, path);
      assert.doesNotMatch(source, /publishForm/, path);
      assert.doesNotMatch(source, /refreshValues/, path);
    }
    const page = readRepo("app/help/page.tsx");
    assert.match(page, /@\/lib\/signing\/feature-gate/);
  });
});
