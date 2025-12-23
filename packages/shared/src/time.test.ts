import { sleep } from './time'

it('sleep', async () => {
  const start = Date.now()
  await sleep(100)
  expect(Date.now() - start).toBeGreaterThanOrEqual(90)
  expect(Date.now() - start).toBeLessThanOrEqual(110)
})
