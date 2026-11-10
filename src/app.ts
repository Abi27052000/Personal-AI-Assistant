import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text('Hello HI!')
})

export default app
