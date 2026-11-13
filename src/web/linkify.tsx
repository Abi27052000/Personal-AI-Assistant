import { css } from 'hono/css'
import type { FC } from 'hono/jsx'

/*
 * Turns http(s) web addresses in message text into clickable links.
 * Everything else stays plain text (JSX escapes it), and only http(s) URLs
 * become links, so schemes like javascript: can never be clicked.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/g
/** Punctuation that usually ends a sentence rather than belonging to the URL. */
const TRAILING_PUNCTUATION = /[.,;:!?'")\]}>]+$/

export type TextPart = { type: 'text'; text: string } | { type: 'link'; href: string }

/** Split text into plain-text and link parts, in order. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    let href = match[0]
    const start = match.index ?? 0
    // Keep a closing ")" if the URL itself has an opening one, e.g. Wikipedia links.
    const trailing = href.match(TRAILING_PUNCTUATION)?.[0] ?? ''
    let keep = 0
    if (trailing.startsWith(')') && href.slice(0, -trailing.length).includes('(')) keep = 1
    href = href.slice(0, href.length - trailing.length + keep)

    if (!isHttpUrl(href)) continue
    if (start > last) parts.push({ type: 'text', text: text.slice(last, start) })
    parts.push({ type: 'link', href })
    last = start + href.length
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
  return parts
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0
  } catch {
    return false
  }
}

const link = css`
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
`

/** Message text with web addresses as links that open in a new tab. */
export const Linkified: FC<{ text: string }> = ({ text }) => (
  <>
    {splitLinks(text).map((part) =>
      part.type === 'text' ? (
        part.text
      ) : (
        <a class={link} href={part.href} target="_blank" rel="noopener noreferrer nofollow">
          {part.href}
        </a>
      ),
    )}
  </>
)
