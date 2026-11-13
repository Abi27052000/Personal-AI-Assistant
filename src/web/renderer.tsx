import { css, Style } from 'hono/css'
import { jsxRenderer } from 'hono/jsx-renderer'

declare module 'hono' {
  interface ContextRenderer {
    (content: string | Promise<string>, props: { title: string }): Response
  }
}

// Page-wide styles. hono/css only hoists :-hono-global when it is the whole
// block, so it lives apart from the layout class below.
const globalStyles = css`
  :-hono-global {
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.5;
      color: #1f2328;
      background: #f6f7f9;
    }
    a {
      color: #2563eb;
    }
    @media (prefers-color-scheme: dark) {
      body {
        color: #e6e8eb;
        background: #15171a;
      }
      a {
        color: #7aa7ff;
      }
    }
  }
`

const page = css`
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
`

/** Shared page layout. Pages call c.render(<Page />, { title }). */
export const renderer = jsxRenderer(({ children, title }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{`${title} · Personal AI Assistant`}</title>
      <Style />
    </head>
    <body class={globalStyles}>
      <main class={page}>{children}</main>
    </body>
  </html>
))
