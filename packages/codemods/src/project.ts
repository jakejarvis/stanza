import { Project, ScriptTarget, ModuleKind } from "ts-morph";
import path from "node:path";
import fs from "node:fs";

/**
 * Open (or lazily load) a ts-morph Project rooted at the given directory.
 * Prefers the project's tsconfig if present; otherwise falls back to a
 * minimal in-memory config sufficient for adding imports / modifying
 * exports without resolving the whole graph.
 */
export function openProject(rootDir: string): Project {
  const tsconfigPath = path.join(rootDir, "tsconfig.json");

  if (fs.existsSync(tsconfigPath)) {
    return new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });
  }

  return new Project({
    compilerOptions: {
      target: ScriptTarget.ES2022,
      module: ModuleKind.ESNext,
      moduleResolution: 100, // Bundler
      allowJs: true,
      jsx: 4, // ReactJSX
    },
  });
}
