import { Polar } from "@polar-sh/sdk";

const accessToken = process.env.POLAR_ACCESS_TOKEN;
if (!accessToken) {
  throw new Error("POLAR_ACCESS_TOKEN is not set. See .env.example.");
}

export const polar = new Polar({
  accessToken,
  server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "production",
});
