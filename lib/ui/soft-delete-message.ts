export function buildSoftDeleteMessage(options: {
  objectType: string;
  itemName?: string | null;
  consequence?: string;
  canRestore?: boolean;
}): string {
  const { objectType, itemName, consequence, canRestore = false } = options;
  const trimmedName = itemName?.trim();
  const removeLine = trimmedName
    ? `This will remove ${trimmedName} from active use.`
    : `This will remove this ${objectType.toLowerCase()} from active use.`;

  const consequenceLine =
    consequence ??
    (canRestore
      ? "It can be restored later."
      : "It will be hidden from normal use.");

  return `${removeLine} ${consequenceLine}`;
}
