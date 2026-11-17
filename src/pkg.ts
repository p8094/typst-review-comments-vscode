import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const FILES = ["typst.toml", "lib.typ", "LICENSE", "README.md"];

/** Typst's data directory for packages (see the Typst packages documentation). */
export function typstPackagesDir(): string {
  if (process.env.TYPST_PACKAGE_PATH) return process.env.TYPST_PACKAGE_PATH;
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "typst", "packages");
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "typst", "packages");
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "typst", "packages");
}

const INDEX = "https://packages.typst.org/preview/index.json";

export function newestVersion(versions: string[]): string | null {
  const key = (v: string): number[] => v.split(".").map((n) => parseInt(n, 10) || 0);
  const cmp = (a: string, b: string): number => {
    const x = key(a), y = key(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; }
    return 0;
  };
  return versions.length ? [...versions].sort(cmp)[versions.length - 1] : null;
}

/** Newest review-comments version listed on Typst Universe, or null (not published / offline). */
export async function latestPreviewVersion(): Promise<string | null> {
  try {
    const res = await fetch(INDEX);
    if (!res.ok) return null;
    const list = (await res.json()) as { name: string; version: string }[];
    return newestVersion(list.filter((p) => p.name === "review-comments").map((p) => p.version));
  } catch {
    return null;
  }
}

export function versionFromToml(toml: string): string | null {
  return /^\s*version\s*=\s*"([^"]+)"/m.exec(toml)?.[1] ?? null;
}

/**
 * Copies the review-comments package bundled with the extension (`typst-package/`)
 * to `@local/review-comments:<version>` in Typst's data directory. Works offline
 * on macOS, Linux and Windows.
 */
export function installLocalPackage(extensionPath: string): { version: string; dir: string } {
  const src = path.join(extensionPath, "typst-package");
  const toml = path.join(src, "typst.toml");
  if (!fs.existsSync(toml)) throw new Error("The bundled Typst package is missing from the extension.");
  const version = versionFromToml(fs.readFileSync(toml, "utf8"));
  if (!version) throw new Error("Could not read the package version from typst.toml.");
  const dir = path.join(typstPackagesDir(), "local", "review-comments", version);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of FILES) {
    if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dir, f));
  }
  return { version, dir };
}

/** Version of the package bundled with the extension. */
export function bundledVersion(extensionPath: string): string | null {
  try { return versionFromToml(fs.readFileSync(path.join(extensionPath, "typst-package", "typst.toml"), "utf8")); }
  catch { return null; }
}

/** True if version a is newer than or equal to b. */
export function versionAtLeast(a: string, b: string): boolean {
  return newestVersion([a, b]) === a;
}
