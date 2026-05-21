import type { ChangeEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CopyButton } from "@/components/copy-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProjectSetup({
  name,
  defaultName,
  command,
  onNameChange,
}: {
  name: string;
  defaultName: string;
  command: string;
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
        <div className="flex items-stretch gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-none border border-border bg-muted/50 px-3 py-2 font-mono text-[11px] whitespace-pre sm:text-xs">
            <code>{command}</code>
          </pre>
          <CopyButton value={command} className="h-auto!" />
        </div>
      </div>
    </Card>
  );
}
