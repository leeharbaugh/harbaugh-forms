import { redirect } from "next/navigation";

/** Fields catalog UI removed; keep route as redirect for old bookmarks. */
export default function Page() {
  redirect("/forms");
}
