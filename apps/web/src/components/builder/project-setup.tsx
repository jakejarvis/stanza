import { validateProjectName } from "@stanza/registry";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Card } from "@/components/ui/card";
import { Field, FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ProjectSetup({
  name,
  defaultName,
  onNameChange,
}: {
  name: string;
  defaultName: string;
  onNameChange: (name: string) => void;
}) {
  // Keep the field responsive locally and debounce the upward push: each
  // `onNameChange` navigates, reruns the loader, and rebuilds the file tree, so
  // firing it per keystroke is wasteful. External `name` changes (history nav,
  // reset) flow back into the draft.
  const [draft, setDraft] = useState(name);
  const onNameChangeRef = useRef(onNameChange);
  onNameChangeRef.current = onNameChange;

  const inputId = useId();
  const errorId = `${inputId}-error`;

  useEffect(() => {
    setDraft(name);
  }, [name]);

  const validation = useMemo(() => validateProjectName(draft), [draft]);
  // Suppress the "required" error when the field is empty: the placeholder
  // already telegraphs the fallback to `defaultName`, and the gated debounce
  // below keeps the URL on the last valid name.
  const showError = !validation.ok && draft.trim().length > 0;

  useEffect(() => {
    if (draft === name) return undefined;
    if (!validation.ok) return undefined;
    const timer = setTimeout(() => onNameChangeRef.current(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, name, validation.ok]);

  const onDraftChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    [],
  );

  return (
    <Card className="px-3 py-4">
      <FieldSet>
        <FieldLegend variant="label" className="text-muted-foreground">
          Project name
        </FieldLegend>
        <Field data-invalid={showError || undefined}>
          <Input
            id={inputId}
            name="project-name"
            value={draft}
            placeholder={defaultName}
            onChange={onDraftChange}
            autoComplete="off"
            spellCheck={false}
            maxLength={214}
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
          />
          <FieldError id={errorId} className="capitalize">
            {showError ? validation.message : null}
          </FieldError>
        </Field>
      </FieldSet>
    </Card>
  );
}
