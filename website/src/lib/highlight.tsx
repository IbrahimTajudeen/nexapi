import type { ReactNode } from "react";

type Lang = "ts" | "tsx" | "js" | "json" | "bash" | "yaml" | "text" | "csharp";

const KEYWORDS = new Set(
  (
    "const let var function return if else for while of in new await async import export from as type interface class extends implements default " +
    "throw try catch finally typeof instanceof void null undefined true false this readonly satisfies enum case switch break continue public private static namespace using"
  ).split(" "),
);
const BASH_WORDS = new Set(
  "curl npm pnpm yarn bun npx node git cd mkdir sh tar unzip export echo chmod cat cp mv ls".split(
    " ",
  ),
);

interface Rule {
  re: RegExp;
  cls: string;
}

function rulesFor(lang: Lang): Rule[] {
  switch (lang) {
    case "json":
      return [
        { re: /"(?:\\.|[^"\\])*"(?=\s*:)/y, cls: "tok-t" },
        { re: /"(?:\\.|[^"\\])*"/y, cls: "tok-s" },
        { re: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, cls: "tok-n" },
        { re: /\b(?:true|false|null)\b/y, cls: "tok-k" },
      ];
    case "yaml":
      return [
        { re: /#[^\n]*/y, cls: "tok-c" },
        { re: /[\w$./-]+(?=\s*:(?:\s|$))/y, cls: "tok-t" },
        { re: /"(?:\\.|[^"\\])*"|'[^']*'/y, cls: "tok-s" },
        { re: /-?\d+(?:\.\d+)?\b/y, cls: "tok-n" },
        { re: /\b(?:true|false|null)\b/y, cls: "tok-k" },
      ];
    case "bash":
      return [
        { re: /#[^\n]*/y, cls: "tok-c" },
        { re: /"(?:\\.|[^"\\])*"|'[^']*'/y, cls: "tok-s" },
        { re: /\$\{?[A-Za-z_][\w]*\}?/y, cls: "tok-n" },
        { re: /--?[A-Za-z][\w-]*/y, cls: "tok-t" },
      ];
    case "text":
      return [];
    default:
      return [
        { re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y, cls: "tok-c" },
        { re: /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y, cls: "tok-s" },
        { re: /\b\d[\d_]*(?:\.\d+)?\b/y, cls: "tok-n" },
      ];
  }
}

/** A deliberately small tokenizer: enough colour to read code, no parser, no dependencies. */
export function highlight(code: string, lang: Lang): ReactNode[] {
  const rules = rulesFor(lang);
  const out: ReactNode[] = [];
  let buf = "";
  let key = 0;
  const flush = (): void => {
    if (buf) out.push(buf);
    buf = "";
  };
  const wordRe = /[A-Za-z_$][\w$]*/y;
  let i = 0;
  scan: while (i < code.length) {
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(code);
      if (m && m.index === i && m[0].length > 0) {
        flush();
        out.push(
          <span key={key++} className={rule.cls}>
            {m[0]}
          </span>,
        );
        i += m[0].length;
        continue scan;
      }
    }
    wordRe.lastIndex = i;
    const w = wordRe.exec(code);
    if (
      w &&
      w.index === i &&
      (lang === "ts" || lang === "tsx" || lang === "js" || lang === "csharp" || lang === "bash")
    ) {
      const word = w[0];
      const next = code.slice(i + word.length).match(/^\s*(\()/);
      let cls: string | undefined;
      if (lang === "bash")
        cls =
          BASH_WORDS.has(word) && /(^|\n)\s*(\$ )?$/.test(code.slice(Math.max(0, i - 12), i))
            ? "tok-k"
            : undefined;
      else if (KEYWORDS.has(word)) cls = "tok-k";
      else if (next) cls = "tok-f";
      else if (/^[A-Z]/.test(word)) cls = "tok-t";
      if (cls) {
        flush();
        out.push(
          <span key={key++} className={cls}>
            {word}
          </span>,
        );
      } else buf += word;
      i += word.length;
      continue;
    }
    buf += code[i];
    i += 1;
  }
  flush();
  return out;
}

export type { Lang };
