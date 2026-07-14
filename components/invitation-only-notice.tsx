import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Link from "next/link";

export function InvitationOnlyNotice({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Invitation only</CardTitle>
          <CardDescription>
            Harbaugh Forms is currently invitation-only. Contact an
            administrator for access.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            If you already received an invitation email, use the link in that
            message to set your password and sign in.
          </p>
          <Button asChild className="w-full">
            <Link href="/auth/login">Go to login</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
