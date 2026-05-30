import { createFileRoute } from "@tanstack/react-router";
import { StanzaManifestSchema } from "@withstanza/schema";
import { z } from "zod";

export const Route = createFileRoute("/schema.json")({
  server: {
    handlers: {
      GET: () => {
        const compiled = {
          $id: "https://stanza.tools/schema.json",
          title: "Stanza manifest",
          description: "Schema for stanza.json — a Stanza monorepo manifest.",
          ...z.toJSONSchema(StanzaManifestSchema),
        };

        return new Response(`${JSON.stringify(compiled, null, 2)}\n`, {
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        });
      },
    },
  },
});
