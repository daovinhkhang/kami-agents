import { Copy, Text } from "@medusajs/ui"
import { lazy, Suspense } from "react"

/* ------------------------------------------------------------------ */
/*  Markdown Components                                                */
/* ------------------------------------------------------------------ */

/** GFM-capable markdown renderer (react-markdown + remark-gfm) styled with
 *  Medusa UI tokens. Replaces the former hand-rolled parser, which mangled
 *  tables with empty cells, nested lists, nested emphasis, h4-h6, blockquotes,
 *  strikethrough, and alignment rows. */
const CodeBlock = ({ code, lang }: { code: string; lang?: string }) => (
  <div className="group relative my-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle">
    <div className="flex items-center justify-between border-b border-ui-border-base px-3 py-1.5">
      <Text size="xsmall" className="text-ui-fg-muted font-mono">{lang || "code"}</Text>
      <Copy content={code} />
    </div>
    <pre className="overflow-x-auto p-3">
      <code className="font-mono text-xs whitespace-pre text-ui-fg-base">{code}</code>
    </pre>
  </div>
)

const markdownComponents = {
  h1: ({ children }: any) => <div className="text-lg font-bold text-ui-fg-base mt-3 mb-1">{children}</div>,
  h2: ({ children }: any) => <div className="text-base font-semibold text-ui-fg-base mt-3 mb-1">{children}</div>,
  h3: ({ children }: any) => <div className="text-sm font-semibold text-ui-fg-base mt-3 mb-1">{children}</div>,
  h4: ({ children }: any) => <div className="text-sm font-semibold text-ui-fg-base mt-2 mb-1">{children}</div>,
  h5: ({ children }: any) => <div className="text-xs font-semibold text-ui-fg-subtle mt-2 mb-0.5">{children}</div>,
  h6: ({ children }: any) => <div className="text-xs font-semibold text-ui-fg-muted mt-2 mb-0.5">{children}</div>,
  p: ({ children }: any) => <p className="text-sm text-ui-fg-base my-1 leading-relaxed">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-5 my-1.5 space-y-0.5 text-sm text-ui-fg-base">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5 text-sm text-ui-fg-base">{children}</ol>,
  li: ({ children }: any) => <li className="text-sm text-ui-fg-base">{children}</li>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: any) => <em>{children}</em>,
  del: ({ children }: any) => <del className="text-ui-fg-muted">{children}</del>,
  a: ({ href, children }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-ui-fg-interactive underline">
      {children}
    </a>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="my-2 border-l-2 border-ui-border-strong pl-3 text-sm italic text-ui-fg-subtle">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-ui-border-base" />,
  table: ({ children }: any) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full border-collapse border border-ui-border-base text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead>{children}</thead>,
  th: ({ children, style }: any) => (
    <th style={style} className="border border-ui-border-base bg-ui-bg-subtle px-2 py-1 font-semibold text-ui-fg-base">{children}</th>
  ),
  td: ({ children, style }: any) => (
    <td style={style} className="border border-ui-border-base px-2 py-1 text-ui-fg-base">{children}</td>
  ),
  code: ({ inline, className, children }: any) => {
    const text = String(children ?? "").replace(/\n$/, "")
    const langMatch = /language-(\w+)/.exec(className ?? "")
    // react-markdown v10 drops the `inline` flag; a fenced block wraps its code
    // in a <pre>, so we detect a block by the presence of a language class or a
    // trailing newline. Everything else renders as inline code.
    const isBlock = Boolean(langMatch) || text.includes("\n")
    if (!inline && isBlock) {
      return <CodeBlock code={text} lang={langMatch?.[1]} />
    }
    return <code className="rounded bg-ui-bg-subtle px-1 py-0.5 font-mono text-xs text-ui-fg-base">{children}</code>
  },
  pre: ({ children }: any) => <>{children}</>,
}

// react-markdown v10 and remark-gfm v4 are ESM-only. Under tsc's Node16 module
// mode this file is treated as CommonJS, so a static import is rejected. A lazy
// dynamic import satisfies both tsc and the Vite bundler, and yields a
// plain-text fallback while the chunk loads.
const LazyMarkdown = lazy(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import("react-markdown"),
    import("remark-gfm"),
  ])
  return {
    default: ({ text }: { text: string }) => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    ),
  }
})

export const KamiMarkdown = ({ text }: { text: string }) => (
  <Suspense fallback={<p className="text-sm text-ui-fg-base my-1 whitespace-pre-wrap">{text}</p>}>
    <LazyMarkdown text={text} />
  </Suspense>
)
