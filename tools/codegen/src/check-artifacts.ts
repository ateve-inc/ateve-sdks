import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import path from "node:path";
import { root } from "./generator.ts";
import { checkVersions, pythonVersion } from "./versioning.ts";

interface PackagedSDK {
  default: new (options: {
    apiKey: string;
    fetch: (input: unknown, init?: RequestInit) => Promise<Response>;
  }) => {
    search(request: {
      query: string;
      maxResults?: number;
      content?: { text?: { maxCharacters?: number } };
    }): Promise<{ id: string }>;
  };
}

function run(command: string, args: string[], cwd = root): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0)
    throw new Error(`${command} failed: ${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
const temporary = mkdtempSync(path.join(tmpdir(), "ateve-artifacts-"));
const fixture: { id: string } = JSON.parse(
  readFileSync(path.join(root, "packages/contract/fixtures/golden-response.json"), "utf8"),
);
try {
  const version = checkVersions(root);
  const pythonPackageVersion = pythonVersion(version);
  const packDirectory = path.resolve(process.argv[2] ?? temporary);
  if (!process.argv[2])
    run("pnpm", ["--filter", "@ateve/js", "pack", "--pack-destination", temporary]);
  const tgz = readdirSync(packDirectory).find((file) => file === `ateve-${version}.tgz`);
  assert.ok(tgz, "npm package was not produced");
  const npmArchive = path.join(packDirectory, tgz);
  const content = run("tar", ["-tzf", npmArchive]);
  assert.match(content, /package\/dist\/index.d.ts/);
  assert.doesNotMatch(content, /package\/(?:src|test|contract|tools)\//);
  run("tar", ["-xzf", npmArchive, "-C", temporary]);
  const packagePath = path.join(temporary, "package");
  const declarations = readFileSync(path.join(packagePath, "dist/index.d.ts"), "utf8");
  assert.match(declarations, /text\?: string \| null/);
  assert.doesNotMatch(declarations, /AnswerBlock|Citation|UsageBreakdown|VideoItem/);
  const npmManifest: { name: string; version: string } = JSON.parse(
    readFileSync(path.join(packagePath, "package.json"), "utf8"),
  );
  assert.equal(npmManifest.name, "ateve", "npm tarball must retain its public name");
  const sourceManifest: { version: string } = JSON.parse(
    readFileSync(path.join(root, "packages/js/package.json"), "utf8"),
  );
  assert.equal(npmManifest.version, sourceManifest.version);
  const cjs: PackagedSDK = createRequire(import.meta.url)(path.join(packagePath, "dist/index.js"));
  const esm: PackagedSDK = await import(
    pathToFileURL(path.join(packagePath, "dist/index.mjs")).href
  );
  for (const sdk of [cjs, esm]) {
    let hits = 0;
    const client = new sdk.default({
      apiKey: "sk_test",
      fetch: async (_input, init) => {
        hits++;
        assert.equal(new Headers(init?.headers).get("User-Agent"), `ateve-js/${version}`);
        assert.deepEqual(JSON.parse(String(init?.body)), {
          query: "artifact smoke test",
          max_results: 2,
          content: { snippet: true, text: { max_characters: 100, format: "text" } },
        });
        return new Response(JSON.stringify(fixture));
      },
    });
    const response = await client.search({
      query: "artifact smoke test",
      maxResults: 2,
      content: { text: { maxCharacters: 100 } },
    });
    assert.equal(response.id, fixture.id);
    assert.equal(hits, 1);
  }

  const python = path.join(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  const pythonDist = path.join(root, "packages/python/dist");
  const wheel = readdirSync(pythonDist).find(
    (file) => file.startsWith(`ateve-${pythonPackageVersion}-`) && file.endsWith(".whl"),
  );
  const sdist = readdirSync(pythonDist).find(
    (file) => file === `ateve-${pythonPackageVersion}.tar.gz`,
  );
  assert.ok(wheel && sdist, "Python wheel/sdist were not produced");
  run(
    python,
    [
      "-c",
      `
import sys, zipfile, tarfile, json, asyncio
sys.path.insert(0, sys.argv[1])
with zipfile.ZipFile(sys.argv[1]) as archive:
    names = archive.namelist()
    for name in ['ateve/models.py', 'ateve/_model_exports.py', 'ateve/py.typed']:
        assert name in names, name
    assert not any(name.startswith(('tools/', 'contract/')) for name in names)
with tarfile.open(sys.argv[2]) as archive:
    assert any(name.endswith('/src/ateve/models.py') for name in archive.getnames())
import ateve, httpx
assert '.whl/' in ateve.__file__, ateve.__file__
assert ateve.__version__ == sys.argv[4], ateve.__version__
for name in ['AnswerBlock', 'Citation', 'Usage', 'UsageBreakdown', 'VideoItem']:
    assert not hasattr(ateve, name), name
body = json.loads(sys.argv[3])
hits = []
def handler(request):
    hits.append(request)
    assert request.headers['User-Agent'] == f'ateve-python/{sys.argv[4]}'
    assert json.loads(request.content) == {
        'query': 'artifact smoke test', 'max_results': 2,
        'content': {'snippet': True, 'text': {'max_characters': 100, 'format': 'text'}},
    }
    return httpx.Response(200, json=body)
with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
    with ateve.Ateve('sk_test', http_client=transport) as client:
        assert client.search('artifact smoke test', max_results=2,
            content=ateve.ContentOptions(text=ateve.TextOptions(max_characters=100))).id == body['id']
async def check_async():
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport:
        async with ateve.AsyncAteve('sk_test', http_client=transport) as client:
            assert (await client.search('artifact smoke test', max_results=2,
                content=ateve.ContentOptions(text=ateve.TextOptions(max_characters=100)))).id == body['id']
asyncio.run(check_async())
assert len(hits) == 2
`,
      path.join(pythonDist, wheel),
      path.join(pythonDist, sdist),
      JSON.stringify(fixture),
      pythonPackageVersion,
    ],
    temporary,
  );

  const javaDirectory = path.join(root, "packages/java");
  const jar = readdirSync(path.join(javaDirectory, "target")).find(
    (file) => file === `ateve-java-${version}.jar`,
  );
  assert.ok(jar, "Java JAR was not produced");
  const javaHome = process.env.JAVA_HOME;
  const executable = (name: string): string => (javaHome ? path.join(javaHome, "bin", name) : name);
  const jarPath = path.join(javaDirectory, "target", jar);
  const jarContents = run(executable("jar"), ["tf", jarPath]);
  assert.match(jarContents, /ai\/ateve\/models\/SearchRequest.class/);
  assert.match(jarContents, /ai\/ateve\/models\/TextOptions.class/);
  assert.doesNotMatch(
    jarContents,
    /ai\/ateve\/models\/(?:AnswerBlock|Citation|Usage|UsageBreakdown|VideoItem)\.class/,
  );
  assert.doesNotMatch(jarContents, /(?:MockApi|Fixtures|AteveClientTest)\.class/);
  const classpathFile = path.join(temporary, "classpath.txt");
  run(
    "mvn",
    [
      "--batch-mode",
      "--no-transfer-progress",
      "dependency:build-classpath",
      "-DincludeScope=runtime",
      `-Dmdep.outputFile=${classpathFile}`,
    ],
    javaDirectory,
  );
  const classpath = [jarPath, readFileSync(classpathFile, "utf8").trim()].join(path.delimiter);
  const source = path.join(temporary, "ArtifactSmoke.java");
  writeFileSync(
    source,
    `
import ai.ateve.AteveClient;
import ai.ateve.models.SearchRequest;
import ai.ateve.models.ContentOptions;
import ai.ateve.models.TextOptions;
public final class ArtifactSmoke {
    public static void main(String[] args) throws Exception {
        AteveClient client = AteveClient.builder().apiKey("sk_test").baseUrl(args[0]).build();
        SearchRequest request = SearchRequest.builder().query("artifact smoke test").maxResults(2)
            .content(ContentOptions.builder().text(TextOptions.builder().maxCharacters(100).build()).build()).build();
        if (!client.search(request).id().equals(args[1])) throw new AssertionError("sync response");
        if (!client.searchAsync(request).get().id().equals(args[1])) throw new AssertionError("async response");
    }
}
`,
  );
  run(
    executable("javac"),
    ["--release", "11", "-cp", classpath, "-d", temporary, source],
    temporary,
  );
  let hits = 0;
  const server = createServer((request, response) => {
    hits++;
    assert.equal(request.headers["user-agent"], `ateve-java/${version}`);
    assert.equal(request.url, "/v1/search");
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString("utf8")), {
        query: "artifact smoke test",
        max_results: 2,
        content: { snippet: true, text: { max_characters: 100, format: "text" } },
      });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(fixture));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        executable("java"),
        [
          "-cp",
          [temporary, classpath].join(path.delimiter),
          "ArtifactSmoke",
          `http://127.0.0.1:${address.port}`,
          fixture.id,
        ],
        { stdio: "inherit" },
      );
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error(`Java artifact smoke exited ${code}`)),
      );
    });
    assert.equal(hits, 2);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  console.log(
    "npm ESM/CJS, Python wheel/sdist, and Java JAR verified; packaged sync/async clients work.",
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
