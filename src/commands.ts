// Runs the Creator operator CLI (e.g. `pnpm --dir ~/dev/creator trpc:ops`) and
// parses its JSON output. Creator talks to its own API and YouTube; the plugin
// only ever sees the normalized JSON the CLI prints.

export const COMMAND_TIMEOUT_MS = 30_000;

export class CreatorCommandError extends Error {}

export type Spawn = (argv: readonly string[]) => { stdout: ReadableStream<Uint8Array>; stderr: ReadableStream<Uint8Array>; exited: Promise<number>; kill(): void };

const bunSpawn: Spawn = (argv) => Bun.spawn([...argv], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });

export function createCommandRunner(prefix: readonly string[], options: { label: string; setting: string; timeoutMs?: number; spawn?: Spawn }) {
  const spawn = options.spawn ?? bunSpawn;
  const timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS;
  return async (args: readonly string[]): Promise<unknown> => {
    if (prefix.length === 0) throw new CreatorCommandError(`${options.label} is not configured: set ${options.setting} in the plugin settings.`);
    let child: ReturnType<Spawn>;
    try {
      child = spawn([...prefix, ...args]);
    } catch {
      throw new CreatorCommandError(`${options.label} could not be started; check ${options.setting}.`);
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    try {
      const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      if (timedOut) throw new CreatorCommandError(`${options.label} timed out after ${Math.ceil(timeoutMs / 1000)}s.`);
      if (exitCode !== 0) throw new CreatorCommandError(`${options.label} failed (exit ${exitCode}): ${lastLine(stderr) || "no error output"}`);
      return parseJson(stdout, options.label);
    } finally {
      clearTimeout(timer);
    }
  };
}

// Only the CLI's final error line, trimmed: stack traces, URLs and response
// bodies stay out of tool results and views.
function lastLine(text: string): string {
  const line = text.trim().split("\n").map((part) => part.trim()).filter(Boolean).at(-1) ?? "";
  const clean = line.replace(/^Error:\s*/u, "").replace(/https?:\/\/\S+/gu, "<url>");
  return clean.length > 200 ? `${clean.slice(0, 197)}...` : clean;
}

// Package runners may print a banner before the JSON document.
function parseJson(stdout: string, label: string): unknown {
  const text = stdout.trim();
  const start = text.search(/[{[]/u);
  if (start >= 0) {
    try {
      return JSON.parse(text.slice(start));
    } catch {
      // Fall through to the error below.
    }
  }
  throw new CreatorCommandError(`${label} did not return JSON.`);
}
