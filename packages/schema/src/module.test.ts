import { describe, expect, it } from "vite-plus/test";

import { ModuleSchema } from "./module";

// Minimal valid module shell; tests override `env` (and `app.env`) to exercise
// `envVarSchema`. `ModuleSchema.safeParse` is the boundary that validates
// fetched third-party modules, so this is where the injection guard must bite.
function moduleWith(env: unknown, appEnv?: unknown): unknown {
  return {
    category: "auth",
    id: "x",
    label: "X",
    description: "d",
    version: "1.0.0",
    env,
    ...(appEnv === undefined ? {} : { app: { env: appEnv } }),
    adapters: [{ key: "default", match: {} }],
  };
}

describe("envVarSchema (via ModuleSchema)", () => {
  it("accepts a clean env var", () => {
    const res = ModuleSchema.safeParse(
      moduleWith([{ name: "DATABASE_URL", example: "postgres://localhost/db", required: true }]),
    );
    expect(res.success).toBe(true);
  });

  it("accepts a clean env var with a description", () => {
    const res = ModuleSchema.safeParse(
      moduleWith([
        { name: "API_KEY", example: "sk-...", required: true, description: "The API key." },
      ]),
    );
    expect(res.success).toBe(true);
  });

  it("rejects a name with a newline (line injection)", () => {
    const res = ModuleSchema.safeParse(
      moduleWith([{ name: "FOO\nMALICIOUS", example: "x", required: true }]),
    );
    expect(res.success).toBe(false);
  });

  it("rejects a name that isn't a valid dotenv key", () => {
    const res = ModuleSchema.safeParse(
      moduleWith([{ name: "HAS-DASH", example: "x", required: true }]),
    );
    expect(res.success).toBe(false);
  });

  it("rejects an example with an injected line", () => {
    const res = ModuleSchema.safeParse(
      moduleWith([{ name: "FOO", example: "\nBAR=baz", required: true }]),
    );
    expect(res.success).toBe(false);
  });

  it("rejects a description with a control character", () => {
    const res = ModuleSchema.safeParse(
      moduleWith([{ name: "FOO", example: "x", required: true, description: "ok\nEVIL=1" }]),
    );
    expect(res.success).toBe(false);
  });

  it("applies the same guard to the app.env overlay", () => {
    const res = ModuleSchema.safeParse(
      moduleWith(
        [{ name: "FOO", example: "x", required: true }],
        [{ name: "BAR\nEVIL", example: "y", required: true }],
      ),
    );
    expect(res.success).toBe(false);
  });
});
