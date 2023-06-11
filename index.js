import {match} from "@millennial-sky/util"
import {join} from "node:path"
import {spawn} from "node:child_process"
import {writeFile, unlink} from "node:fs/promises"

const codeRegexp = /```(?:\[(?<attrib>.*?)])?(?<lang>.*?\n)?(?<code>.*?)```/sg

export const parse = (src) => {
  const sections = []
  let match = null
  let currentIndex = 0
  codeRegexp.lastIndex = 0
  while (match = codeRegexp.exec(src)) {
    const {attrib, lang, code} = match.groups
    if (match.index > currentIndex) {
      sections.push({kind: "text", attrib: "", text: src.slice(currentIndex, match.index)})
    }
    sections.push({kind: "code", attrib: attrib ?? "", lang: lang.trim(), code})
    currentIndex = codeRegexp.lastIndex
  }

  return sections
}

export const renderCode = async (sections, includeExamples) => {
  let codeSections = sections.filter(s => 
    s.kind === "code" && 
    !s.attrib.includes("ignore") &&
    (!s.lang || s.lang.toLowerCase() === "javascript")
  )
  if (!includeExamples) codeSections = codeSections.filter(s => !s.attrib.includes("example"))
  return codeSections.map(s => s.code).join("\n")
}

export const renderText = async (sections) => {
  sections = await processExamples(sections)
  return sections.filter(s => !s.attrib.includes("hide")).map(s => match(s, {
    text: ({text}) => text,
    code: ({lang, code}) => `\`\`\`${lang || "javascript"}\n${code}\`\`\``
  })).join("").replace(/\n\n\n+/g, "\n\n")
}

const processExamples = async (sections) => {
  const outputCaptureSections = sections.map((s) => match(s, {
    code: ({attrib, code}) => {
      if (attrib.includes("example")) {
        let showCount = 0
        const newCode = `{console.log("__CAPTURE__")}\n${code}`
          .replace(/\/\/\s*#show/g, "{console.log(\"__SHOW__\")}")
        return {kind: "code", attrib, code: newCode}
      }
      return s
    },
    _: () => s,
  }))
  const code = await renderCode(outputCaptureSections, true)
  const {stdout} = await execString(code, {inheritOutput: false})
  
  const stdoutLines = stdout.split("\n")
  const captureGroups = [];
  for (let l of stdoutLines) {
    if (l === "__CAPTURE__") {
      captureGroups.push([[]])
    }
    else if (captureGroups.length > 0) {
      const captureGroup = captureGroups[captureGroups.length - 1]
      if (l === "__SHOW__") {
        captureGroup.push([])
      }
      else {
        const buf = captureGroup[captureGroup.length - 1]
        buf.push(l)
      }
    }
  }
  
  let captureGroupIndex = 0
  return sections.map((s) => match(s, {
    code: ({attrib, code}) => {
      if (attrib.includes("example")) {
        let showCount = 0
        
        const newCode = code.replace(/\/\/\s*#show/g, () => {
          const captureGroup = captureGroups[captureGroupIndex]
          const buf = captureGroup[showCount++]
          const out = buf.join("\n").trim()
          const isMultiline = out.includes("\n")
          if (isMultiline) 
            return "// Output:\n//   " + out.replace(/\n/g, "\n//   ")
          else
            return "// Output: " + out
        })

        captureGroupIndex++
        return {kind: "code", attrib, code: newCode}
      }
      return s
    },
    _: () => s,
  }))
}

export const execString = async (jsCode, {dir = "./", inheritOutput = true} = {}) => {
  const rnd = Math.random().toString(36).slice(2)
  const tempFilePath = join(dir, `.literate.${rnd}.tmp.mjs`)

  await writeFile(tempFilePath, jsCode)

  return new Promise((resolve, reject) => {
    const spawnOpts = inheritOutput ? { stdio: 'inherit' } : { stdio: ['ignore', 'pipe', 'pipe'] }

    const child = spawn("node", [tempFilePath], spawnOpts)

    const stdout = []
    const stderr = []

    if (!inheritOutput) {
      child.stdout.on("data", (data) => stdout.push(data))
      child.stderr.on("data", (data) => stderr.push(data))
    }
    
    child.on("error", reject)
    child.on("close", async (exitCode) => {
      await unlink(tempFilePath)
      resolve({exitCode, stdout: stdout.join(""), stderr: stderr.join("")})
    })
  })
}
