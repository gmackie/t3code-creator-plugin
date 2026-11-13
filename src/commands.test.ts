import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCommandRunner } from "./commands.ts";

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe("createCommandRunner", () => {
  // Like `pnpm … trpc:ops`, the configured command is a wrapper whose
  // descendants hold stdout open; the timeout must not wait for them.
  it("times out a wrapper command and kills its descendants", async () => {
    const pidFile = join(mkdtempSync(join(tmpdir(), "creator-cmd-")), "pid");
    const run = createCommandRunner(["bash", "-c", `sleep 8 & echo $! > ${pidFile}; wait; echo '{}'`], { label: "Creator command", setting: "CREATOR_COMMAND", timeoutMs: 500 });
    const started = Date.now();
    await expect(run([])).rejects.toThrow("Creator command timed out after 1s.");
    expect(Date.now() - started).toBeLessThan(3000);
    const grandchild = Number(readFileSync(pidFile, "utf8").trim());
    const deadline = Date.now() + 2000;
    while (isAlive(grandchild) && Date.now() < deadline) await Bun.sleep(20);
    expect(isAlive(grandchild)).toBe(false);
  });

  it("returns the JSON a wrapper command prints", async () => {
    const run = createCommandRunner(["bash", "-c", `echo banner; sleep 0.1; echo '{"ok":true}'`], { label: "Creator command", setting: "CREATOR_COMMAND" });
    expect(await run([])).toEqual({ ok: true });
  });
});
