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
  title: "Check your agent profile",
  paragraphs: [
    [
      text("Open "),
      link("/settings", "Settings"),
      text(
        " and check My Agent Profile for your own name, license number, phone, and email. Keep these details current: they fill the agent lines on forms in packets you own. Each agent in your brokerage has a separate profile.",
      ),
    ],
    [
      text(
        "The Brokerage Profile is on the same page. It holds the firm's and broker of record's details and is shared by everyone in the brokerage. A brokerage administrator updates it; other agents can view it.",
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
        "Start with the people involved in the transaction, such as buyers, sellers, landlords, or tenants. You'll choose from these contacts when you create a packet. In ",
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
        "For a Listing or Contract Offer packet, add the property before creating the packet. A Buyer Rep packet focuses on the buyers and does not include a property. You can add a property to a Custom Packet if you need one. In ",
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
      text("Choose "),
      link("/forms", "Forms"),
      text(
        " in the menu to open Form Templates. Your brokerage's forms may already be here and ready to use.",
      ),
    ],
    [
      text(
        "Adding your own form is optional. If you need one, choose Add form template and upload its PDF. Use Map Fields to mark the blanks you want filled in, then choose Publish Form when it's ready. A form must be published before you can add it to a packet template or packet.",
      ),
    ],
  ],
};

const COLLECTIONS_STEP: HelpStep = {
  id: "collections",
  title: "Review Packet Templates",
  paragraphs: [
    [
      text("Choose "),
      link("/collections", "Collections"),
      text(
        " in the menu to open Packet Templates. A packet template is a reusable set of forms, such as a buyer representation or listing set. Your brokerage may already have one you can use. Choose Copy to My Collections if you'd like your own copy.",
      ),
    ],
    [
      text(
        "Creating your own packet template is optional. If you need a set that isn't there yet, choose Add packet template. Once a form is published, you can add it to the template.",
      ),
    ],
  ],
};

const PACKETS_STEP: HelpStep = {
  id: "packets",
  title: "Create a packet",
  paragraphs: [
    [
      text("A packet keeps the paperwork for one transaction together. In "),
      link("/", "Packets"),
      text(
        ", choose Create packet, then choose Buyer Rep, Listing, Contract Offer, or Custom Packet.",
      ),
    ],
    [
      text(
        "Buyer Rep: choose a buyer representation packet template, add the buyers, review the forms, and choose Create packet.",
      ),
    ],
    [
      text(
        "Listing: choose a listing packet template, add the sellers and property, review the forms, and choose Create packet. For a lease listing, add the landlords instead of sellers.",
      ),
    ],
    [
      text(
        "Contract Offer: choose a contract offer packet template, add the contacts and property, review the forms, and choose Create packet.",
      ),
    ],
    [
      text(
        "Custom Packet: name the packet and add any contacts or property you need. Create the empty packet, then upload your own documents.",
      ),
    ],
    [
      text(
        "The first person you add becomes the main party. You can change anyone's role later in the packet.",
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
        " and choose Fill form. Review the names, property, and other fields, then fill in anything that's still blank.",
      ),
    ],
    [
      text(
        "If a contact, property, My Agent Profile, or the Brokerage Profile changes, open the form and choose Refresh Values while it's still a Draft. This brings in the updated details and keeps anything you entered by hand.",
      ),
    ],
    [
      text(
        "Choose Download PDF for one form or Download All Forms for the whole packet. When a form is ready, choose Mark Final to lock it. You can still download a final form.",
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
        ". A Signing started from a packet uses the packet name as its title. If you start in Signings, you'll enter the title yourself.",
      ),
    ],
    [
      text(
        "Choose Use this Packet to bring in its people and documents. Next, choose Prepare Documents and place the signatures, initials, and dates. Choose Send to email invitations, or Begin In-Person Signing when everyone is with you.",
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
        " to check whether a Signing is a draft, in progress, complete, declined, or cancelled. Once it's complete, you can download individual signed documents, the Audit certificate, and the Combined signed package.",
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
