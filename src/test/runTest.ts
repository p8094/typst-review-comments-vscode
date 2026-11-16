import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { runTests } from "@vscode/test-electron";

async function main() {
  const root = path.resolve(__dirname, "../..");
  // Work on a copy so the fixtures stay pristine.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "rc-fixture-"));
  fs.cpSync(path.join(root, "test-fixtures/thesis"), work, { recursive: true });
  process.env.RC_FIXTURE = work;
  // Local copy of the review-comments package, so the Typst CLI can resolve
  // @preview/review-comments:0.3.0 without network access.
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "rc-pkgcache-"));
  const pkgDst = path.join(cache, "preview/review-comments/0.3.0");
  fs.mkdirSync(pkgDst, { recursive: true });
  for (const f of ["lib.typ", "typst.toml"]) fs.copyFileSync(path.resolve(root, "../comments-pkg", f), path.join(pkgDst, f));
  process.env.RC_PKG_CACHE = cache;
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.resolve(__dirname, "suite/index"),
    launchArgs: [work, "--disable-extensions", "--user-data-dir", fs.mkdtempSync(path.join(os.tmpdir(), "rc-ud-"))],
  });
}
main().catch((e) => { console.error(e); process.exit(1); });
