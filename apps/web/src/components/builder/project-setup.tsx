import { IconAlertCircle } from "@tabler/icons-react";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { validateProjectName } from "@withstanza/registry";
import type { ChangeEvent } from "react";
import { useId, useState } from "react";

import { Card } from "@/components/ui/card";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProjectSetup({
  name,
  defaultName,
  onNameChange,
}: {
  name: string;
  defaultName: string;
  onNameChange: (name: string) => void;
}) {
  // `draft` is null until the user types; the input then renders draft instead
  // of the URL-backed prop so each keystroke is visible immediately while the
  // debounced commit lags behind. We never echo the prop back into draft — no
  // sync effect needed.
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? name;

  const inputId = useId();
  const errorId = `${inputId}-error`;

  const validation = validateProjectName(display);
  // The placeholder telegraphs the `defaultName` fallback, so an empty field
  // shouldn't render a "required" error.
  const showError = !validation.ok && display.trim().length > 0;

  const commit = useDebouncedCallback(
    (value: string) => {
      if (validateProjectName(value).ok) onNameChange(value);
    },
    { wait: 300 },
  );

  const onDraftChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDraft(value);
    commit(value);
  };

  return (
    <Card className="gap-0 px-3 py-3.5">
      <Label
        htmlFor={inputId}
        className="mb-2 text-[13px] leading-none font-medium text-muted-foreground"
      >
        Project name
      </Label>
      <Field data-invalid={showError || undefined}>
        <Input
          id={inputId}
          name="project-name"
          value={display}
          placeholder={defaultName}
          onChange={onDraftChange}
          autoComplete="off"
          spellCheck={false}
          maxLength={214}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? errorId : undefined}
          className="text-[13px]!"
        />
        {showError && (
          <FieldError id={errorId} className="flex items-center gap-1">
            <IconAlertCircle className="size-3" aria-hidden="true" />
            <span>
              {`${validation.message.charAt(0).toUpperCase()}${validation.message.slice(1)}`}
            </span>
          </FieldError>
        )}
      </Field>
    </Card>
  );
}
