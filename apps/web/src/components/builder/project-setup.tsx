import { validateProjectName } from "@stanza/registry";
import { IconAlertCircle } from "@tabler/icons-react";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";

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
  // Debounce the upward push (`onNameChange` navigates → reruns the loader →
  // rebuilds the file tree) while keeping the field locally responsive.
  // External `name` changes (history nav, reset) flow back into the draft, but
  // gated by `lastSyncedRef`: we must ignore the echo of our own pushes, since
  // between firing the debounce and the new `name` prop arriving the user can
  // type more characters, and naive `setDraft(name)` would clobber them.
  const [draft, setDraft] = useState(name);
  const lastSyncedRef = useRef(name);

  const inputId = useId();
  const errorId = `${inputId}-error`;

  useEffect(() => {
    if (name === lastSyncedRef.current) return;
    lastSyncedRef.current = name;
    setDraft(name);
  }, [name]);

  const validation = useMemo(() => validateProjectName(draft), [draft]);
  // Suppress the "required" error when the field is empty: the placeholder
  // already telegraphs the fallback to `defaultName`, and the gated debounce
  // below keeps the URL on the last valid name.
  const showError = !validation.ok && draft.trim().length > 0;

  // `useEffectEvent` reads the latest `onNameChange` without making the
  // debounce effect re-run when the parent rebuilds the callback.
  const commit = useEffectEvent((next: string) => {
    lastSyncedRef.current = next;
    onNameChange(next);
  });

  useEffect(() => {
    if (draft === lastSyncedRef.current) return undefined;
    if (!validation.ok) return undefined;
    const timer = setTimeout(() => commit(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, validation.ok]);

  const onDraftChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    [],
  );

  return (
    <Card className="gap-0 px-3 py-3.5">
      <Label htmlFor={inputId} className="mb-1.5 text-[13px] font-medium text-muted-foreground">
        Project name
      </Label>
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
