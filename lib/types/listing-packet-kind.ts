/** Owner-party labeling/role for listing packets (sale vs lease). */
export type ListingOwnerKind = "seller" | "landlord";

type FormIdentity = {
  form_code?: string | null;
  form_name?: string | null;
};

type CollectionFormLinkLike = {
  status?: string | null;
  forms?: FormIdentity | null;
};

type CollectionLike = {
  collection_name?: string | null;
  collection_forms?: CollectionFormLinkLike[] | null;
};

type PacketFormLike = {
  status?: string | null;
  forms?: FormIdentity | null;
};

const LEASE_LISTING_FORM_CODE_PATTERN =
  /txr[-_\s]?1102|txr[-_\s]?1423/i;

const LEASE_LISTING_NAME_PATTERN = /lease\s*listing/i;

/** True when a form is a residential lease listing (or lease listing amendment). */
export function isLeaseListingForm(form: FormIdentity | null | undefined): boolean {
  if (!form) {
    return false;
  }

  const code = form.form_code?.trim() ?? "";
  const name = form.form_name?.trim() ?? "";

  if (code && LEASE_LISTING_FORM_CODE_PATTERN.test(code)) {
    return true;
  }

  if (name && LEASE_LISTING_NAME_PATTERN.test(name)) {
    return true;
  }

  if (code && LEASE_LISTING_NAME_PATTERN.test(code.replace(/[_-]+/g, " "))) {
    return true;
  }

  return false;
}

function collectionNameLooksLikeLeaseListing(
  collectionName: string | null | undefined,
): boolean {
  const name = collectionName?.trim() ?? "";
  if (!name) {
    return false;
  }

  return LEASE_LISTING_NAME_PATTERN.test(name) || /\blease\b/i.test(name);
}

/** True when a listing collection is intended for lease listings (landlords). */
export function isLeaseListingCollection(
  collection: CollectionLike | null | undefined,
): boolean {
  if (!collection) {
    return false;
  }

  if (collectionNameLooksLikeLeaseListing(collection.collection_name)) {
    return true;
  }

  return (collection.collection_forms ?? []).some((link) => {
    if (link.status && link.status !== "ACTIVE") {
      return false;
    }
    return isLeaseListingForm(link.forms);
  });
}

/** True when an existing listing packet contains lease listing forms / naming. */
export function isLeaseListingPacket(input: {
  packetType?: string | null;
  collectionName?: string | null;
  packetForms?: PacketFormLike[] | null;
}): boolean {
  if (input.packetType != null && input.packetType !== "listing") {
    return false;
  }

  if (collectionNameLooksLikeLeaseListing(input.collectionName)) {
    return true;
  }

  return (input.packetForms ?? []).some((packetForm) => {
    if (packetForm.status && packetForm.status !== "ACTIVE") {
      return false;
    }
    return isLeaseListingForm(packetForm.forms);
  });
}

export function getListingOwnerKindFromCollection(
  collection: CollectionLike | null | undefined,
): ListingOwnerKind {
  return isLeaseListingCollection(collection) ? "landlord" : "seller";
}

export function getListingOwnerKindFromPacket(input: {
  packetType?: string | null;
  collectionName?: string | null;
  packetForms?: PacketFormLike[] | null;
}): ListingOwnerKind {
  return isLeaseListingPacket(input) ? "landlord" : "seller";
}
