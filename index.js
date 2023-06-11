import {match} from "@millennial-sky/util"

const codeRegexp = /```(?:\[(?<attrib>.*?)])?(?<lang>.*?\n)?(?<code>.*?)```/sg

export const parse = (src) => {
  const sections = []
  let match = null
  let currentIndex = 0
  codeRegexp.lastIndex = 0
  while (match = codeRegexp.exec(src)) {
    const {attrib, lang, code} = match.groups
    if (match.index > currentIndex) {
      sections.push({kind: "text", text: src.slice(currentIndex, match.index)})
    }
    sections.push({kind: "code", attrib, lang: lang.trim(), code})
    currentIndex = codeRegexp.lastIndex
  }

  return sections
}

export const renderCode = (sections, includeExamples) => {
  let codeSections = sections.filter(s => 
    s.kind === "code" && 
    !s.attrib?.includes("ignore") &&
    (!s.lang || s.lang.toLowerCase() === "javascript")
  )
  if (!includeExamples) codeSections = codeSections.filter(s => !s.attrib?.includes("example"))
  return codeSections.map(s => s.code).join("\n")
}

export const renderText = (sections) => {
  return sections.filter(s => !s.attrib?.includes("hide")).map(s => match(s, {
    text: ({text}) => text,
    code: ({lang, code}) => `\`\`\`${lang || "javascript"}\n${code}\`\`\``
  })).join("").replace(/\n\n\n+/g, "\n\n")
}
