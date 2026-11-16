import { describe, expect, it } from 'bun:test'

const projectRoot = Bun.fileURLToPath(new URL('../../', import.meta.url))
const loggerUrl = new URL('../libs/logger.ts', import.meta.url).href
const mailerUrl = new URL('../libs/nodemailer.ts', import.meta.url).href
const templatesUrl = new URL('../utils/emailTemplate.utils.ts', import.meta.url)
  .href
const ngrokUrl = new URL('../utils/ngrok.ts', import.meta.url).href

// Subprocesses use the real lifecycle modules without the suite's mailer/ngrok mocks.
async function checkRecovery(source: string): Promise<void> {
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '-e',
      `
        import assert from 'node:assert/strict'
        import { mock } from 'bun:test'
        const records = []
        const log = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(
          level => [level, (message, meta) => records.push({ level, message, meta })],
        ))
        await mock.module(${JSON.stringify(loggerUrl)}, () => ({ log }))
        ${source}
      `,
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        MAILER_USER: 'test@example.com',
        MAILER_PASS: 'test-password',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  expect({ exitCode, stdout, stderr }).toEqual({
    exitCode: 0,
    stdout: '',
    stderr: '',
  })
}

const smtpPrelude = `
  const provider = {
    sendMail: mock(async () => ({ messageId: 'message-1' })),
    close: mock(() => {}),
  }
  const createTransport = mock(() => provider)
  await mock.module('nodemailer', () => ({ default: { createTransport } }))
  await mock.module(${JSON.stringify(templatesUrl)}, () => ({
    getEmailHtml: async () => '<p>Test</p>',
    getEmailSubject: () => 'Test',
  }))
  const { sendMail, getTransporter, closeMailer } = await import(${JSON.stringify(mailerUrl)})
  const email = { type: 'verification', toAddress: 'test@example.com', tokenLink: 'https://example.com' }
`

describe('SMTP recovery', () => {
  it('recovers after delivery failures without retrying sends itself', async () => {
    await checkRecovery(`
      ${smtpPrelude}
      provider.sendMail.mockRejectedValueOnce(new Error('SMTP offline'))
      await assert.rejects(sendMail(email), /Failed to send/)
      assert.equal(provider.sendMail.mock.calls.length, 1)
      await sendMail(email)
      await sendMail(email)
      assert.equal(records.filter(r => r.message === '✅ SMTP email delivery recovered').length, 1)
      assert.equal(provider.sendMail.mock.calls.length, 3)
      closeMailer()
    `)
  })

  it('ignores delivery outcomes from a transport closed during shutdown', async () => {
    await checkRecovery(`
      ${smtpPrelude}
      const failed = Promise.withResolvers()
      const sent = Promise.withResolvers()
      provider.sendMail.mockReturnValueOnce(failed.promise).mockReturnValueOnce(sent.promise)
      const failing = assert.rejects(sendMail(email), /Failed to send/)
      const sending = sendMail(email)
      for (let i = 0; i < 5; i++) { await Promise.resolve() }
      closeMailer()

      const replacement = {
        sendMail: mock(async () => ({ messageId: 'message-2' })),
        close: mock(() => {}),
      }
      createTransport.mockReturnValueOnce(replacement)
      getTransporter()
      failed.reject(new Error('Old transport closed'))
      await failing
      await sendMail(email)
      assert.equal(records.length, 0)

      replacement.sendMail.mockRejectedValueOnce(new Error('SMTP offline'))
      await assert.rejects(sendMail(email), /Failed to send/)
      sent.resolve({ messageId: 'old-message' })
      await sending
      assert.equal(records.length, 0)
      await sendMail(email)
      assert.equal(records.filter(r => r.message === '✅ SMTP email delivery recovered').length, 1)
      closeMailer()
    `)
  })
})

describe('Ngrok recovery', () => {
  it('retries connection failures, coalesces startup, and observes runtime reconnection', async () => {
    await checkRecovery(`
      let onStatusChange
      const listener = { url: () => 'https://example.test', close: mock(async () => { onStatusChange('closed') }) }
      const forward = mock(async config => { onStatusChange = config.onStatusChange; return listener })
      forward.mockRejectedValueOnce(new Error('Network offline'))
      await mock.module('@ngrok/ngrok', () => ({ default: { forward } }))
      const { ngrokForward, closeNgrokTunnel } = await import(${JSON.stringify(ngrokUrl)})
      const pending = ngrokForward()
      assert.equal(ngrokForward(), pending)
      assert.equal(await pending, listener)
      assert.equal(ngrokForward(), pending)
      assert.equal(forward.mock.calls.length, 2)
      onStatusChange('closed')
      onStatusChange('closed')
      onStatusChange('connected')
      onStatusChange('connected')
      assert.equal(records.filter(r => r.level === 'info').length, 2)
      assert.equal(records.filter(r => r.message === '⚠️ Ngrok tunnel disconnected; reconnecting').length, 1)
      await closeNgrokTunnel()
      await closeNgrokTunnel()
      assert.equal(listener.close.mock.calls.length, 1)
      assert.equal(records.filter(r => r.level === 'warn').length, 2)
    `)
  }, 15000)

  it('cancels pending retry delays during shutdown', async () => {
    await checkRecovery(`
      let waiting
      const startedWaiting = new Promise(resolve => { waiting = resolve })
      log.warn = (message, meta) => { records.push({ level: 'warn', message, meta }); waiting() }
      const forward = mock(async () => { throw new Error('Network offline') })
      await mock.module('@ngrok/ngrok', () => ({ default: { forward } }))
      const { ngrokForward, closeNgrokTunnel } = await import(${JSON.stringify(ngrokUrl)})
      const pending = ngrokForward()
      await startedWaiting
      await closeNgrokTunnel()
      assert.equal(await pending, undefined)
      assert.equal(forward.mock.calls.length, 1)
    `)
  })

  it('surfaces provider rejections and closes a listener that arrives after shutdown', async () => {
    await checkRecovery(`
      const rejection = Object.assign(new Error('Invalid credentials'), { errorCode: 'ERR_NGROK_4018' })
      let resolveListener
      const listener = { close: mock(async () => {}), url: () => 'https://example.test' }
      const forward = mock(() => new Promise(resolve => { resolveListener = resolve }))
      forward.mockRejectedValueOnce(rejection)
      await mock.module('@ngrok/ngrok', () => ({ default: { forward } }))
      const { ngrokForward, closeNgrokTunnel } = await import(${JSON.stringify(ngrokUrl)})
      await assert.rejects(ngrokForward(), rejection)
      assert.equal(forward.mock.calls.length, 1)
      const pending = ngrokForward()
      const closing = closeNgrokTunnel()
      resolveListener(listener)
      await closing
      assert.equal(await pending, undefined)
      assert.equal(listener.close.mock.calls.length, 1)
      assert.equal(records.length, 0)
    `)
  })
})
