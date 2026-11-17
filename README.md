# Typst Review Comments

A VS Code extension to manage the review comments of the
[`review-comments`](https://github.com/p8094/typst-review-comments) Typst
package: list them in a side panel, edit, resolve and delete them, insert new
ones from a selection, and switch them on or off in the preview and PDF.

Comments are plain Typst code in your `.typ` files:

```typ
This is #comment(author: "Pedro", date: "2026-11-15")[Add a citation][a claim].
```

## Features

- **Comments panel** (activity bar, "Review comments"): every comment of the
  workspace grouped by file, with author, date, line and the commented text.
  Filter on *All / Open / Resolved*, and switch between *All files* and
  *This file*.
- **Click a comment** to jump to it in the editor and open its editor: change
  the text, author and date, **mark it resolved** (it turns green) or reopen
  it, or **delete** it (the commented text stays in the document).
- **Add a comment:** select text and press `Cmd+Alt+M` (`Ctrl+Alt+M` on
  Windows/Linux) or right-click → *Review Comments: Add Comment*. Without a
  selection an anchor-only comment is inserted at the cursor. The author comes
  from the setting `reviewComments.author` (asked once if empty) and the date
  is today's.
- **Show comments** switch: sets `enabled: true/false` in the document's
  `#show: review-comments.with(...)` line, so the preview and the exported PDF
  show or hide all comments. **Show resolved comments** sets `show-resolved`.
  If no setup line exists yet, turning the switch on adds it (and the import)
  to the file you choose.

All changes are normal edits to the document: they appear in the undo stack,
and nothing is saved unless you enable `reviewComments.saveAfterEdit`. The
preview updates as you type; for PDF export on save, save the file.

## Installation

**From the marketplace** (once published): open the Extensions view
(`Cmd+Shift+X`), search for *Typst Review Comments* and click **Install**, or run

```
code --install-extension ULusofona-MartijnKuipers.typst-review-comments
```

VSCodium and other editors can get it from [Open VSX](https://open-vsx.org).

**From a `.vsix` file** (e.g. from the GitHub releases page): in the Extensions
view choose `…` → **Install from VSIX…**, or run
`code --install-extension typst-review-comments-<version>.vsix`.

**From source:**

```
npm install
npm run package          # builds typst-review-comments-<version>.vsix
code --install-extension typst-review-comments-*.vsix
```

Then reload the window, open a `.typ` file and click the *Review comments* icon
in the activity bar. Finally set up the Typst package, see below.

## Requirements

The Typst documents need the `review-comments` package
(`#import "@preview/review-comments:0.3.0": *`). A Typst language extension such
as Tinymist is recommended for the preview.

### Getting the Typst package

The package is published on GitHub
([p8094/typst-review-comments](https://github.com/p8094/typst-review-comments))
and, once accepted, on Typst Universe. To set it up run **Review Comments: Get
Typst Package** (or **? Setup → Get package** in the panel). It:

1. checks whether the package is listed on Typst Universe. If so, nothing is
   installed: Typst downloads `@preview/review-comments` automatically on the
   first compile, and new imports use `@preview`;
2. otherwise downloads the latest version from GitHub into Typst's local package
   folder and switches new imports to `@local/review-comments`:
   - macOS: `~/Library/Application Support/typst/packages/local/review-comments/<version>/`
   - Linux: `~/.local/share/typst/packages/local/review-comments/<version>/`
   - Windows: `%APPDATA%\typst\packages\local\review-comments\<version>\`

Manual alternative: copy `lib.typ` and `typst.toml` from the GitHub repository
into the folder above, or just add
`#import "@preview/review-comments:0.3.0": *` once the package is on Universe.
Run the command again later to move from the GitHub copy to Universe.

## Settings

| Setting                          | Default       | Description                                           |
| -------------------------------- | ------------- | ----------------------------------------------------- |
| `reviewComments.author`          | `""`          | Author stored in new comments                         |
| `reviewComments.includeDate`     | `true`        | Store today's date in new comments                    |
| `reviewComments.scope`           | `"workspace"` | List comments of all workspace files or the active one |
| `reviewComments.packageSource`   | `"preview"`   | `preview`: import `@preview/review-comments`. `local`: import `@local/review-comments`. Set by the Get Typst Package command |
| `reviewComments.packageVersion`  | `"0.3.0"`     | Version used when the extension adds the import       |
| `reviewComments.saveAfterEdit`   | `false`       | Save the file after the extension edits it            |

## Limitations

- Comments nested inside the note or highlighted text of another comment are
  not listed.
- Comments in `//` comments, `/* */` comments and raw blocks are ignored.
- The note is edited as Typst markup; square brackets in it must be balanced
  (or escaped as `\[` and `\]`).

## Development

```sh
npm install
npm test                  # compile + unit tests of the parser and edit logic
npm run test:integration  # runs the extension in a real VS Code (downloaded on first use)
                          # and compiles the edited fixture with the typst CLI
```

Press `F5` in VS Code to start an Extension Development Host. Build an
installable package with `npm run package` (creates a `.vsix`).

## License

MIT

## Links

- Typst package `review-comments` (the `#comment` function and the
  `review-comments.with(...)` setup):
  <https://github.com/p8094/typst-review-comments>
- This extension: <https://github.com/p8094/typst-review-comments-vscode>
