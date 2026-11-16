import * as path from "path";
import * as fs from "fs";
import Mocha from "mocha";

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", timeout: 20000, color: true });
  for (const f of fs.readdirSync(__dirname).filter((f) => f.endsWith(".itest.js"))) mocha.addFile(path.join(__dirname, f));
  await new Promise<void>((res, rej) => mocha.run((fails) => (fails ? rej(new Error(fails + " tests failed")) : res())));
}
