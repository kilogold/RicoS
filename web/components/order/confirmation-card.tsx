import type { ReactNode } from "react";
import { FaCheck, FaQuestion, FaXmark } from "react-icons/fa6";

export type ConfirmationCardVariant = "confirmed" | "failed" | "unknown";

type ConfirmationCardProps = {
  variant: ConfirmationCardVariant;
  title: string;
  message: string;
  orderReference?: string | null;
  orderReferenceLabel?: string;
  callStoreMessage?: string;
  children?: ReactNode;
};

const ICONS = {
  confirmed: FaCheck,
  failed: FaXmark,
  unknown: FaQuestion,
} as const;

export function ConfirmationCard({
  variant,
  title,
  message,
  orderReference,
  orderReferenceLabel,
  callStoreMessage,
  children,
}: ConfirmationCardProps) {
  const Icon = ICONS[variant];
  const isAlert = variant !== "confirmed";

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-3xl bg-surface p-8 text-center shadow-xl sm:p-10">
        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-accent">
          <Icon className="h-11 w-11 text-white" aria-hidden="true" />
        </div>
        <h1
          className="mt-8 text-4xl font-extrabold text-accent"
          role={isAlert ? "alert" : undefined}
        >
          {title}
        </h1>
        <p
          className="mt-5 text-lg leading-relaxed text-muted"
          role={isAlert ? "alert" : undefined}
        >
          {message}
        </p>
        {callStoreMessage ? (
          <p className="mt-4 text-lg leading-relaxed text-muted">{callStoreMessage}</p>
        ) : null}
        {orderReference && orderReferenceLabel ? (
          <div className="mt-6 text-left font-mono text-sm text-foreground/80">
            <p>{orderReferenceLabel}:</p>
            <p className="mt-1 break-all">{orderReference}</p>
          </div>
        ) : null}
        {children ? <div className="mt-10 flex flex-col items-center gap-4">{children}</div> : null}
      </div>
    </div>
  );
}

export function ConfirmationLoadingCard({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-3xl bg-surface p-8 text-center shadow-xl sm:p-10">
        <p className="text-lg text-muted">{message}</p>
      </div>
    </div>
  );
}
