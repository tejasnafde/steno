import ReactMarkdown, { defaultUrlTransform } from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

type Props = { children: string; className?: string }

export function Markdown({ children, className }: Props) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 text-sm leading-relaxed break-words [&_li]:mt-1", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith("data:image/") ? url : defaultUrlTransform(url))}
        components={{
          h1: ({ children }) => <h1 className="text-lg font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="font-semibold">{children}</h3>,
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              {children}
            </a>
          ),
          blockquote: ({ children }) => <blockquote className="border-l-2 pl-3 text-muted-foreground">{children}</blockquote>,
          pre: ({ children }) => <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
          img: ({ src, alt }) => <img src={src} alt={alt ?? ""} loading="lazy" className="max-h-[32rem] max-w-full rounded-lg border" />,
          code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>,
          table: ({ children }) => (
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-max text-left text-xs [&_td]:max-w-72 [&_td]:border-t [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1">{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
