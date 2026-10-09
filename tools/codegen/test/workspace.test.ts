import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { root } from "../src/generator.ts";

interface Task {
  taskId: string;
  command: string;
  directory: string;
  dependencies: string[];
}

test("Turbo discovers the native Python SDK alongside the distinct JS workspace", () => {
  const result = spawnSync("turbo", ["run", "generate", "test", "typecheck", "--dry=json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const graph: { packages: string[]; tasks: Task[] } = JSON.parse(result.stdout);
  assert.ok(graph.packages.includes("ateve"));
  assert.ok(graph.packages.includes("@ateve/js"));
  assert.ok(!graph.packages.includes("@ateve/python"));
  const pythonTest = graph.tasks.find((task) => task.taskId === "ateve#test");
  assert.ok(pythonTest);
  assert.equal(pythonTest.directory, "packages/python");
  assert.match(pythonTest.command, /^uv run .*--package ateve pytest /);
  const pythonGenerate = graph.tasks.find((task) => task.taskId === "ateve#generate");
  assert.ok(pythonGenerate?.dependencies.includes("@ateve/codegen#build"));
  assert.ok(graph.tasks.some((task) => task.taskId === "ateve#typecheck"));
});
