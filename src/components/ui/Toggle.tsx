"use client";

/**
 * A switch that submits "1" or "0".
 *
 * A bare checkbox submits nothing at all when it is off, and the settings
 * writer only touches keys the form actually sends — so an unchecked box would
 * silently leave the old value in place, which on "programme enabled" is the
 * difference between off and still running.
 *
 * The trailing hidden input is what makes "off" a value. The order matters: the
 * reader takes the *first* entry for a name, so the checkbox has to come first
 * (checked → "1" wins) and the fallback after it (unchecked → only "0" is
 * sent). Swapping them would pin the setting to off forever.
 *
 * Lifted out of AffiliatePolicyForm, where it was written, because the
 * performance settings need exactly the same thing and a second copy of a
 * control whose correctness depends on the order of two inputs is a second
 * chance to get that order wrong.
 */
export function Toggle({
  name,
  value,
  label,
  hint,
  defaultOn = true,
}: {
  name: string;
  value: string | undefined;
  label: string;
  hint?: React.ReactNode;
  /** What an unset value means. Most switches are on until turned off. */
  defaultOn?: boolean;
}) {
  const raw = (value ?? "").trim();
  const on = raw === "" ? defaultOn : raw !== "0";
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name={name}
          value="1"
          defaultChecked={on}
          className="mt-0.5 h-4 w-4 shrink-0 accent-niki-orange"
        />
        <span>
          <span className="block text-sm font-medium text-niki-ink/80">{label}</span>
          {hint ? (
            <span className="mt-0.5 block text-xs leading-relaxed text-niki-ink/50">{hint}</span>
          ) : null}
        </span>
      </label>
      <input type="hidden" name={name} value="0" />
    </div>
  );
}
