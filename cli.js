#!/usr/bin/env node

import {readFile, writeFile, unlink} from "node:fs/promises"
import {join, extname} from "node:path"
import {spawn} from "node:child_process"

import {parse, renderCode, renderText} from "./index.js"

const cli = async (args) => {
  if (args.length === 0) {
    printHelp()
    process.exit(1)
  }

  const commands = ["compile", "run", "help"]

  const opts = {
    command: args[0] ?? "help",
    files: []
  }

  if (!commands.includes(opts.command)) fail("Invalid command:", args[0])

  for (let i = 1; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case "--js": opts.jsFile = args[++i]; break
      case "--md": opts.mdFile = args[++i]; break
      case "--include-examples": opts.includeExamples = true; break
      default:
        if (arg.startsWith("-")) fail("Invalid option:", arg)
        opts.files.push(arg)
    }
  }

  switch (opts.command) {
    case "compile": await compile(opts); break
    case "run": await run(opts); break
    case "help": printHelp(); break
  }
}

const printHelp = () => {
  console.log(`Usage: literate [command] [options] [files]`);
  console.log(`Commands:`);
  console.log(`  compile: Compile literate files into markdown and javascript`);
  console.log(`  run: Run a literate file`);
  console.log(`  help: Print this help message`);
}

const run = async ({files, includeExamples}) => {
  if (files.length === 0) fail("No files specified")
  if (files.length > 1) fail("Too many files specified")

  const src = await readFile(files[0], "utf8")
  const sections = parse(src)
  process.exit(await execString(renderCode(sections, includeExamples ?? true)))
}

const compile = async ({files, jsFile, mdFile, includeExamples}) => {
  if ((jsFile || mdFile) && files.length > 1) {
    fail("Cannot specify --js or --md with multiple files")
  }

  if (files.length === 0) fail("No files specified")
  for (let file of files) {
    const ext = extname(files[0])
    const filename = files[0].slice(0, -ext.length)
    const src = await readFile(file, "utf8")
    const sections = parse(src)
    const jsPath = jsFile ?? `${filename}.js`
    const mdPath = mdFile ?? `${filename}.md`
    await writeFile(mdPath, renderText(sections))
    await writeFile(jsPath, renderCode(sections, includeExamples ?? false))
  }
}

const execString = async (jsCode, dir = "./") => {
  const tempFilePath = join(dir, ".literate.tmp.mjs")

  await writeFile(tempFilePath, jsCode)

  return new Promise((resolve, reject) => {
    const child = spawn("node", [tempFilePath])

    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)
    child.on("error", reject)
    child.on("close", async (code) => {
      await unlink(tempFilePath)
      resolve(code)
    })
  })
}

const fail = (...args) => {
  console.error(...args)
  process.exit(1)
}

await cli(process.argv.slice(2))

