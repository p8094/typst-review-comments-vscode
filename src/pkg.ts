import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const RAW = "https://raw.githubusercontent.com/p8094/typst-review-comments/main/";
const FILES = ["typst.toml", "lib.typ", "LICENSE", "README.md"];

/** Typst's data directory for packages (see the Typst packages documentation). */
export function typstPackagesDir(): string {
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
 * Downloads the review-comments package and stores it as
 * `@local/review-comments:<version>`. Returns the installed version and folder.
 */
export async function installLocalPackage(): Promise<{ version: string; dir: string }> {
  const got = new Map<string, string>();
  for (const f of FILES) {
    const res = await fetch(RAW + f);
    if (!res.ok) {
      if (f === "typst.toml" || f === "lib.typ") throw new Error(`Could not download ${f} (HTTP ${res.status}).`);
      continue; // LICENSE and README are optional
    }
    got.set(f, await res.text());
  }
  const version = versionFromToml(got.get("typst.toml")!);
  if (!version) throw new Error("Could not read the package version from typst.toml.");
  const dir = path.join(typstPackagesDir(), "local", "review-comments", version);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, content] of got) fs.writeFileSync(path.join(dir, f), content);
  return { version, dir };
}
