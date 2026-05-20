import { describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { addNamedImport, addDefaultImport, removeImport } from "./imports.ts";

function file(src: string) {
  const project = new Project({ useInMemoryFileSystem: true });
  return project.createSourceFile("x.ts", src);
}

describe("addNamedImport", () => {
  it("inserts when no import for the module exists", () => {
    const sf = file("");
    addNamedImport(sf, "react", "useState");
    expect(sf.getText()).toContain(`import { useState } from "react"`);
  });

  it("merges named imports into an existing declaration", () => {
    const sf = file(`import { useState } from "react";\n`);
    addNamedImport(sf, "react", ["useEffect", "useMemo"]);
    const text = sf.getText();
    expect(text).toContain("useState");
    expect(text).toContain("useEffect");
    expect(text).toContain("useMemo");
    expect(text.match(/from "react"/g)?.length).toBe(1);
  });

  it("is idempotent on the same named import", () => {
    const sf = file(`import { useState } from "react";\n`);
    addNamedImport(sf, "react", "useState");
    expect(sf.getText().match(/useState/g)?.length).toBe(1);
  });
});

describe("addDefaultImport", () => {
  it("adds a default import alongside named imports if present", () => {
    const sf = file(`import { useState } from "react";\n`);
    addDefaultImport(sf, "react", "React");
    expect(sf.getText()).toMatch(/import React, \{ useState \} from "react"/);
  });
});

describe("removeImport", () => {
  it("removes the whole declaration when named is omitted", () => {
    const sf = file(`import { useState } from "react";\n`);
    removeImport(sf, "react");
    expect(sf.getText()).not.toContain("react");
  });

  it("removes only the listed named imports, keeping the rest", () => {
    const sf = file(`import { useState, useEffect } from "react";\n`);
    removeImport(sf, "react", ["useState"]);
    const text = sf.getText();
    expect(text).toContain("useEffect");
    expect(text).not.toContain("useState");
  });

  it("drops the declaration when all named imports are removed and no default", () => {
    const sf = file(`import { useState } from "react";\n`);
    removeImport(sf, "react", ["useState"]);
    expect(sf.getText()).not.toContain("react");
  });
});
