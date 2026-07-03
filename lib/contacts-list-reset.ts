export const CONTACTS_LIST_RESET_EVENT = "contacts:list-reset";

export function dispatchContactsListReset(): void {
  window.dispatchEvent(new Event(CONTACTS_LIST_RESET_EVENT));
}

export function isContactsRoute(pathname: string): boolean {
  return pathname === "/contacts" || pathname.startsWith("/contacts/");
}
