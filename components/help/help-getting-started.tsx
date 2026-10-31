import {
  HELP_EMAIL_DISPLAY,
  HELP_EMAIL_HREF,
  HELP_PHONE_DISPLAY,
  HELP_PHONE_HREF,
  getGettingStartedSteps,
  type HelpInline,
} from "@/lib/help/getting-started";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import Link from "next/link";

const textLinkClass =
  "rounded-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function HelpText({ parts }: { parts: HelpInline[] }) {
  return (
    <p className="text-sm leading-6 text-muted-foreground">
      {parts.map((part, index) =>
        part.kind === "text" ? (
          <span key={index}>{part.value}</span>
        ) : (
          <Link key={index} href={part.href} className={textLinkClass}>
            {part.label}
          </Link>
        ),
      )}
    </p>
  );
}

export function HelpGettingStarted({
  nativeSigningEnabled,
}: {
  nativeSigningEnabled: boolean;
}) {
  const steps = getGettingStartedSteps(nativeSigningEnabled);

  return (
    <div className="min-w-0 max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Help & Getting Started
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Harbaugh Forms takes a transaction from the people and the property
          through the forms and the finished PDFs. Follow these steps the first
          time. This page stays in the menu, so you can open it again whenever
          you need it.
        </p>
      </div>

      <section aria-labelledby="getting-started-heading" className="space-y-4">
        <h2
          id="getting-started-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Getting started
        </h2>
        <ol className="list-decimal space-y-6 pl-5 marker:font-semibold marker:text-foreground">
          {steps.map((step) => (
            <li key={step.id} className="min-w-0 space-y-2 pl-1">
              <h3 className="text-base font-semibold tracking-tight">
                {step.title}
              </h3>
              {step.paragraphs.map((paragraph, index) => (
                <HelpText key={index} parts={paragraph} />
              ))}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="need-help-heading">
        <Card>
          <CardHeader className="space-y-2">
            <h2
              id="need-help-heading"
              className="font-semibold leading-none tracking-tight"
            >
              Need Help?
            </h2>
            <p className="text-sm text-muted-foreground">
              Call or email if you get stuck.
            </p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium text-foreground">Phone: </span>
              <a href={HELP_PHONE_HREF} className={textLinkClass}>
                {HELP_PHONE_DISPLAY}
              </a>
            </p>
            <p>
              <span className="font-medium text-foreground">Email: </span>
              <a href={HELP_EMAIL_HREF} className={textLinkClass}>
                {HELP_EMAIL_DISPLAY}
              </a>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
