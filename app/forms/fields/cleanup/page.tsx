import { redirect } from "next/navigation";

/** Fields merge UI removed from product navigation; redirect old bookmarks. */
export default function Page() {
  redirect("/forms");
}
