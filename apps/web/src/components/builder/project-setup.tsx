import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CommandPreview } from "@/components/command-preview";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AddonSelections, Selections } from "@/lib/selection";

export function ProjectSetup({
  name,
  defaultName,
  selections,
  addons,
  onNameChange,
}: {
  name: string;
  defaultName: string;
  selections: Selections;
  addons: AddonSelections;
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
    if (draft === name) return;
    const timer = setTimeout(() => onNameChangeRef.current(draft), 300);
    return () => clearTimeout(timer);
  }, [draft, name]);

  const onDraftChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    [],
  );

  return (
    <Card className="gap-4 p-5">
      <div className="space-y-1.5">
        <Label htmlFor="stanza-project-name" className="font-medium text-muted-foreground">
          Project name
        </Label>
        <Input
          id="stanza-project-name"
          value={draft}
          placeholder={defaultName}
          onChange={onDraftChange}
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Run this</span>
        <CommandPreview name={name} selections={selections} addons={addons} />
      </div>
    </Card>
  );
}
