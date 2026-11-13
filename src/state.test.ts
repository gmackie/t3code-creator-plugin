import { expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fileStateStore } from "./state.ts";

it("keeps approvals per project in a file every copy can read", async () => {
  const path = join(tmpdir(), `creator-state-${crypto.randomUUID()}`, "nested", "state.json");
  const one = fileStateStore(path);
  expect(await one.get("video-1")).toEqual({});
  await one.save("video-1", { approved: true });
  await fileStateStore(path).save("video-2", { approved: true, published: true });
  expect(await one.get("video-1")).toEqual({ projectId: "video-1", approved: true });
  expect(JSON.parse(await readFile(path, "utf8")).workflows["video-2"]).toEqual({ projectId: "video-2", approved: true, published: true });
});

it("treats a corrupt state file as empty instead of approving anything", async () => {
  const path = join(tmpdir(), `creator-state-${crypto.randomUUID()}.json`);
  await writeFile(path, "{not json");
  expect(await fileStateStore(path).get("video-1")).toEqual({});
});
