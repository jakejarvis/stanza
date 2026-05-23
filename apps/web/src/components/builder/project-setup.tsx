import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Card } from "@/components/ui/card";
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
  // Keep the field responsive locally and debounce the upward push: each
  // `onNameChange` navigates, reruns the loader, and rebuilds the file tree, so
  // firing it per keystroke is wasteful. External `name` changes (history nav,
  // reset) flow back into the draft.
  const [draft, setDraft] = useState(name);
  const onNameChangeRef = useRef(onNameChange);
  onNameChangeRef.current = onNameChange;

  useEffect(() => {
    setDraft(name);
  }, [name]);

  useEffect(() => {
    if (draft === name) return undefined;
    const timer = setTimeout(() => onNameChangeRef.current(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, name]);

  const onDraftChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    [],
  );

  return (
    <Card className="px-3 py-4">
      <div className="space-y-1.5">
        <Label htmlFor="stanza-project-name" className="font-medium text-muted-foreground">
          Project name
        </Label>
        <Input
          id="stanza-project-name"
          name="project-name"
          value={draft}
          placeholder={defaultName}
          onChange={onDraftChange}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </Card>
  );
}
