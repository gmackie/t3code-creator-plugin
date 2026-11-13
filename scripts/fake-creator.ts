#!/usr/bin/env bun
// Stand-in for Creator's operator CLI (`pnpm --dir <creator> trpc:ops`) used by
// tests and local runs. Prefix flags pick a behaviour:
//   bun scripts/fake-creator.ts [--mode ok|fail|garbage|hang|unconfirmed] <tool args...>
// `video_creator_snapshot` prints a snapshot; `--project-id <id>` (the publish
// command contract) prints a scheduled publish result.
const argv = process.argv.slice(2);
const modeIndex = argv.indexOf("--mode");
const mode = modeIndex >= 0 ? argv[modeIndex + 1] : "ok";

if (mode === "fail") {
  console.error("    at someStackFrame (internal.ts:1:1)");
  console.error("Error: Creator API https://creator.example/api/trpc returned 502");
  process.exit(1);
}
if (mode === "garbage") {
  console.log("<html>Bad gateway</html>");
  process.exit(0);
}
if (mode === "hang") await new Promise((resolve) => setTimeout(resolve, 60_000));

const flag = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const publishProject = flag("--project-id");
if (publishProject) {
  if (mode === "unconfirmed") {
    console.log(JSON.stringify({ status: "queued" }));
    process.exit(0);
  }
  console.log(JSON.stringify({ status: "scheduled", projectId: publishProject, publishAt: "2026-11-20T17:00:00.000Z" }));
  process.exit(0);
}

if (argv.includes("video_creator_snapshot")) {
  const selected = flag("--projectId") ?? "video-1";
  const projects = [
    { id: "video-1", title: "Build log #12", status: "editing", format: "long" },
    { id: "video-2", title: "Shorts: <script> tips", status: "ready", format: "short" },
  ].map((project) =>
    project.id === selected ? { ...project, package: project.id === "video-1" ? { titleSelected: true, thumbnailSelected: false } : { titleSelected: true, thumbnailSelected: true } } : project,
  );
  console.log("> @gmacko/trpc-cli exec tsx src/index.ts");
  console.log(
    JSON.stringify(
      {
        channel: { name: "GMACKO" },
        ideas: [
          { id: "idea-1", title: "Self-hosting a Git forge", rung: "spark" },
          { id: "idea-2", title: "Agent pairing tour", rung: "package" },
        ],
        projects,
        publishQueue: [{ id: "video-2", title: "Shorts: <script> tips", status: "ready", publishAt: "2026-11-20T17:00:00.000Z" }],
        calendar: [{ id: "slot-1", projectId: selected, title: "Build log #12", platform: "youtube", date: "2026-11-21", status: "planned" }],
        analytics: { ctr: 3.1, views: 12000, averageViewDurationSeconds: 300 },
        sponsors: [
          { id: "deal-1", brandName: "Acme", name: "Acme", status: "signed" },
          { id: "deal-2", name: "Beta", status: "delivered", disclosure: "Paid partnership" },
        ],
        workspace: flag("--workspace"),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.error(`Error: Unknown tool: ${argv.join(" ")}`);
process.exit(1);
