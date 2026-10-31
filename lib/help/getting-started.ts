/**
 * Plain-language Getting Started copy for the authenticated Help page.
 * Native Signing steps are included only when that feature is enabled.
 */

export const HELP_PAGE_PATH = "/help" as const;

export const HELP_PHONE_DISPLAY = "817-881-4768";
export const HELP_PHONE_HREF = "tel:817-881-4768";
export const HELP_EMAIL_DISPLAY = "lee@harbaughbrothers.com";
export const HELP_EMAIL_HREF = "mailto:lee@harbaughbrothers.com";

export type HelpInline =
  | { kind: "text"; value: string }
  | { kind: "link"; href: string; label: string };

export type HelpStep = {
  id: string;
  title: string;
  paragraphs: HelpInline[][];
};

function text(value: string): HelpInline {
  return { kind: "text", value };
}

function link(href: string, label: string): HelpInline {
  return { kind: "link", href, label };
}

const SETTINGS_STEP: HelpStep = {
  id: "settings",
  title: "Review My Agent Profile",
  paragraphs: [
    [
      text("Open "),
      link("/settings", "Settings"),
      text(
        " and check My Agent Profile. It is your own name, license number, phone, and email. You keep it up to date. Those details fill the agent lines on forms in packets you own. Each agent in your brokerage has a separate profile.",
      ),
    ],
    [
      text(
        "Brokerage Profile is on the same page. It is the firm and the broker of record, shared by everyone in the brokerage. A brokerage administrator updates it. Other agents can read the shared Brokerage Profile.",
      ),
    ],
  ],
};

const CONTACTS_STEP: HelpStep = {
  id: "contacts",
  title: "Add contacts",
  paragraphs: [
    [
      text(
        "Add the people who belong on the paperwork: buyers, sellers, landlords, tenants, and anyone else on the transaction. You choose from these contacts when you create a packet. On ",
      ),
      link("/contacts", "Contacts"),
      text(", choose Add contact."),
    ],
  ],
};

const PROPERTIES_STEP: HelpStep = {
  id: "properties",
  title: "Add properties when the transaction has one",
  paragraphs: [
    [
      text(
        "A listing packet and a contract-offer packet each ask you to choose a property, so add it first. A Buyer Rep packet is about your buyers and does not include a property. A Custom Packet can include a property when you want one. On ",
      ),
      link("/properties", "Properties"),
      text(", choose Add property."),
    ],
  ],
};

const FORMS_STEP: HelpStep = {
  id: "forms",
  title: "Review Form Templates",
  paragraphs: [
    [
      text("In the menu this page is "),
      link("/forms", "Forms"),
      text(
        ". On the page the heading is Form Templates. The forms your brokerage already uses are usually here and ready to use.",
      ),
    ],
    [
      text(
        "Adding your own form is optional. Choose Add form template and upload the PDF. Then choose Map Fields and mark the blanks you want filled in. When the form is ready, choose Publish Form. A form has to be published before a packet template or a packet can include it.",
      ),
    ],
  ],
};

const COLLECTIONS_STEP: HelpStep = {
  id: "collections",
  title: "Review Packet Templates",
  paragraphs: [
    [
      text("In the menu this page is "),
      link("/collections", "Collections"),
      text(
        ". On the page the heading is Packet Templates. A packet template is a set of forms you reuse, such as a buyer-rep set or a listing set. Your brokerage may already have templates you can use. Copy to My Collections makes a copy that belongs to you.",
      ),
    ],
    [
      text(
        "Creating your own packet template is optional. Choose Add packet template when you need a set that is not already there. You can add a form after it is published.",
      ),
    ],
  ],
};

const PACKETS_STEP: HelpStep = {
  id: "packets",
  title: "Create a packet",
  paragraphs: [
    [
      text("A packet is one transaction. On "),
      link("/", "Packets"),
      text(
        ", choose Create packet, then choose Buyer Rep, Listing, Contract Offer, or Custom Packet.",
      ),
    ],
    [
      text(
        "Buyer Rep: choose a buyer-rep packet template, add the buyers, review the forms, and choose Create packet.",
      ),
    ],
    [
      text(
        "Listing: choose a listing packet template, add the sellers, choose the property, review the forms, and choose Create packet. A lease listing asks for the landlords.",
      ),
    ],
    [
      text(
        "Contract Offer: choose a contract-offer packet template, add the contacts, choose the property, review the forms, and choose Create packet.",
      ),
    ],
    [
      text(
        "Custom Packet: name the packet, add contacts and a property when you need them, and create the empty packet. Then upload your own documents.",
      ),
    ],
    [
      text(
        "The first person you add is the main party. On the packet you can change anyone's role later.",
      ),
    ],
  ],
};

const FILL_STEP: HelpStep = {
  id: "fill",
  title: "Fill in the forms and download the PDFs",
  paragraphs: [
    [
      text("Open the packet from "),
      link("/", "Packets"),
      text(
        " and choose Fill form. Check the names, the property, and the other blanks, and complete anything still empty.",
      ),
    ],
    [
      text(
        "If you later correct a contact, a property, My Agent Profile, or the Brokerage Profile, open that form and choose Refresh Values while it is still a Draft. Refresh Values brings in the latest of those details. Anything you typed by hand stays as you left it. Refresh Values is available while the form is a Draft.",
      ),
    ],
    [
      text(
        "Choose Download PDF for one form, or Download All Forms for the whole packet. When a form is finished, Mark Final locks it so it stays as it is. You can still download it.",
      ),
    ],
  ],
};

const SEND_STEP: HelpStep = {
  id: "send",
  title: "Send for signatures",
  paragraphs: [
    [
      text("When the forms are ready, choose Create Signing on the packet in "),
      link("/", "Packets"),
      text(". You can also start from "),
      link("/signings", "Signings"),
      text(
        ". A Signing started from the packet takes its title from the packet name. On Signings, you enter the title yourself.",
      ),
    ],
    [
      text(
        "Choose Use this Packet to bring in the people and the documents. Then choose Prepare Documents and place each signature, initial, and date. When that is done, choose Send to email the invitations, or Begin In-Person Signing when the parties are with you.",
      ),
    ],
  ],
};

const TRACK_STEP: HelpStep = {
  id: "track",
  title: "Track the Signing and download the finished documents",
  paragraphs: [
    [
      text("Open "),
      link("/signings", "Signings"),
      text(
        " to see whether each one is a draft, in progress, complete, declined, or cancelled. On a completed Signing, download each signed document, the Audit certificate, and the Combined signed package.",
      ),
    ],
  ],
};

const BASE_STEPS: HelpStep[] = [
  SETTINGS_STEP,
  CONTACTS_STEP,
  PROPERTIES_STEP,
  FORMS_STEP,
  COLLECTIONS_STEP,
  PACKETS_STEP,
  FILL_STEP,
];

export function getGettingStartedSteps(
  nativeSigningEnabled: boolean,
): HelpStep[] {
  if (!nativeSigningEnabled) {
    return BASE_STEPS;
  }
  return [...BASE_STEPS, SEND_STEP, TRACK_STEP];
}

export function helpStepPlainText(steps: HelpStep[]): string {
  return steps
    .flatMap((step) => [
      step.title,
      ...step.paragraphs.flatMap((paragraph) =>
        paragraph.map((part) =>
          part.kind === "text" ? part.value : part.label,
        ),
      ),
    ])
    .join(" ");
}

export function helpStepLinks(
  steps: HelpStep[],
): Array<{ href: string; label: string }> {
  return steps.flatMap((step) =>
    step.paragraphs.flatMap((paragraph) =>
      paragraph.filter(
        (part): part is { kind: "link"; href: string; label: string } =>
          part.kind === "link",
      ),
    ),
  );
}
