"use client";

import type { Weekday } from "@ricos/shared";
import { useState } from "react";
import { AvailabilityGrid } from "@/components/employment/availability-grid";
import {
  CUSTOMER_PHONE_FORMATTED_MAX_LEN,
  formatUsPhoneInput,
} from "@/lib/commerce/domain/customer-contact";
import {
  type EmploymentAvailability,
  type EmploymentShift,
  type EmploymentRole,
  emptyEmploymentAvailability,
} from "@/lib/employment/domain/application-types";
import { hasAnyAvailability } from "@/lib/employment/domain/format-availability-sheet-cells";
import type { ApplicationFieldErrors } from "@/lib/employment/domain/validate-application";
import { getAppStrings } from "@/lib/i18n";
import { useLanguage } from "@/lib/language-context";

type ApiErrorPayload = {
  ok?: boolean;
  error?: string;
  fieldErrors?: ApplicationFieldErrors;
};

function nextAvailabilityAfterToggle(
  current: EmploymentAvailability,
  day: Weekday,
  shift: EmploymentShift,
): EmploymentAvailability {
  const currentDay = current[day];
  let nextAm = currentDay.am;
  let nextPm = currentDay.pm;

  if (shift === "am") {
    nextAm = !currentDay.am;
  } else {
    nextPm = !currentDay.pm;
  }

  return {
    ...current,
    [day]: {
      am: nextAm,
      pm: nextPm,
    },
  };
}

export function EmploymentApplicationForm() {
  const { language } = useLanguage();
  const copy = getAppStrings(language);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<EmploymentRole | "">("");
  const [availability, setAvailability] =
    useState<EmploymentAvailability>(emptyEmploymentAvailability());
  const [resume, setResume] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const hasAvailabilitySelection = hasAnyAvailability(availability);

  const toggleAvailability = (day: Weekday, shift: EmploymentShift) => {
    setAvailability((current) => nextAvailabilityAfterToggle(current, day, shift));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasAvailabilitySelection) {
      setSubmitError(copy.employmentAvailabilityRequired);
      return;
    }
    if (!resume) {
      setSubmitError(copy.employmentResumeRequired);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const formData = new FormData();
    formData.set("fullName", fullName);
    formData.set("phone", phone);
    formData.set("role", role);
    formData.set("availability", JSON.stringify(availability));
    formData.set("resume", resume);

    const response = await fetch("/api/employment/apply", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as ApiErrorPayload | null;
      const firstFieldError = data?.fieldErrors
        ? Object.values(data.fieldErrors).find((value) => Boolean(value))
        : null;
      setSubmitError(firstFieldError ?? copy.employmentSubmitError);
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
    setFullName("");
    setPhone("");
    setRole("");
    setAvailability(emptyEmploymentAvailability());
    setResume(null);
  }

  if (submitted) {
    return (
      <section className="rounded-xl border border-emerald-300/30 bg-emerald-900/20 p-5">
        <p className="text-base text-emerald-100">{copy.employmentSubmitSuccess}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-[#0c2340]/60 p-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-white/90">
          <span>{copy.employmentFullNameLabel}</span>
          <input
            type="text"
            name="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            className="rounded-lg border border-white/15 bg-[#0c2340] px-3 py-2 text-white placeholder:text-white/40 focus:border-[#f4c430]/50 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-white/90">
          <span>{copy.employmentPhoneLabel}</span>
          <input
            type="tel"
            name="phone"
            autoComplete="tel"
            inputMode="tel"
            placeholder="(787) 555-1234"
            maxLength={CUSTOMER_PHONE_FORMATTED_MAX_LEN}
            value={phone}
            onChange={(event) => setPhone(formatUsPhoneInput(event.target.value))}
            required
            className="rounded-lg border border-white/15 bg-[#0c2340] px-3 py-2 text-white placeholder:text-white/40 focus:border-[#f4c430]/50 focus:outline-none"
          />
        </label>

        <fieldset className="rounded-lg border border-white/10 p-4">
          <legend className="px-1 text-sm text-white/90">{copy.employmentRoleLabel}</legend>
          <div className="mt-2 flex flex-col gap-2 text-sm text-white/90 md:flex-row md:gap-6">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="role"
                value="kitchen"
                checked={role === "kitchen"}
                onChange={() => setRole("kitchen")}
                required
                className="h-4 w-4 accent-[#0f7f6f]"
              />
              {copy.employmentRoleKitchen}
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="role"
                value="waiter"
                checked={role === "waiter"}
                onChange={() => setRole("waiter")}
                required
                className="h-4 w-4 accent-[#0f7f6f]"
              />
              {copy.employmentRoleWaiter}
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-white/10 p-4">
          <legend className="px-1 text-sm text-white/90">{copy.employmentAvailabilityLabel}</legend>
          <div className="mt-2">
            <AvailabilityGrid
              availability={availability}
              weekdayLabels={copy.employmentAvailabilityWeekdayLabels}
              dayLabel={copy.employmentAvailabilityDayLabel}
              amLabel="AM"
              pmLabel="PM"
              disabled={submitting}
              onToggle={toggleAvailability}
            />
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm text-white/90">
          <span>{copy.employmentResumeLabel}</span>
          <input
            type="file"
            name="resume"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
            onChange={(event) => setResume(event.target.files?.[0] ?? null)}
            className="rounded-lg border border-white/15 bg-[#0c2340] px-3 py-2 text-white file:mr-3 file:rounded-md file:border-0 file:bg-[#f4c430] file:px-3 file:py-1.5 file:text-[#0c2340]"
          />
          <span className="text-xs text-white/60">{copy.employmentResumeHint}</span>
        </label>

        {submitError ? (
          <p className="text-sm text-red-300" role="alert">
            {submitError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-[#f4c430] px-4 py-3 text-base font-semibold text-[#0c2340] shadow-lg transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? copy.employmentSubmitSubmitting : copy.employmentSubmitCta}
        </button>
      </form>
    </section>
  );
}
