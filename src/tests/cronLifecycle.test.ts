import { describe, expect, it } from 'bun:test'
import { chmod, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

describe('cron container lifecycle', () => {
  it.skipIf(process.getuid?.() !== 0 || !Bun.which('crond'))(
    'cancels active jobs and waits for their cleanup when the scheduler stops',
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), 'bookshop-cron-lifecycle-'),
      )
      let cron: ReturnType<typeof Bun.spawn> | undefined
      let job: ReturnType<typeof Bun.spawn> | undefined
      try {
        await chmod(directory, 0o755)
        const daemon = join(directory, 'crond')
        await Bun.write(
          daemon,
          '#!/bin/sh\ntrap "exit 0" TERM INT\nwhile :; do sleep 1; done\n',
        )
        await chmod(daemon, 0o755)
        const source = new URL('../utils/process.utils.ts', import.meta.url)
          .href
        const jobFile = join(directory, 'job.ts')
        await Bun.write(
          jobFile,
          `
        import { runProcess } from ${JSON.stringify(source)}
        await runProcess({ name: 'Review cron job', once: true, shutdownMs: 1000,
          start: async ctx => {
            const timer = setInterval(() => {}, 1000)
            ctx.defer('work', () => { clearInterval(timer); console.log('JOB_CLEANED_UP') })
            console.log('JOB_RUNNING')
            await ctx.wait(new Promise(() => {}))
          },
        })
      `,
        )
        const environment = {
          ...process.env,
          DB_REPO: 'SQLITE',
          PATH: `${directory}:${process.env.PATH}`,
          CRONTAB_DIR: join(directory, 'crontabs'),
          BOOKSHOP_CRON_JOB_DIRECTORY: '/tmp/bookshop-cron-jobs',
          REVIEW_JOB_FILE: jobFile,
        }
        cron = Bun.spawn(['/bin/sh', 'docker/cron/entrypoint.sh'], {
          cwd: fileURLToPath(new URL('../../', import.meta.url)),
          env: environment,
          stdout: 'pipe',
          stderr: 'pipe',
        })
        for (let attempt = 0; attempt < 100; attempt++) {
          if (
            await stat(environment.BOOKSHOP_CRON_JOB_DIRECTORY).then(
              () => true,
              () => false,
            )
          ) {
            break
          }
          await Bun.sleep(10)
        }
        job = Bun.spawn(
          [
            'su',
            '-p',
            '-s',
            '/bin/sh',
            'bun',
            '-c',
            'exec bun --no-env-file "$REVIEW_JOB_FILE"',
          ],
          { env: environment, stdout: 'pipe', stderr: 'pipe' },
        )
        const reader = (job.stdout as ReadableStream<Uint8Array>).getReader()
        let output = ''
        while (!output.includes('JOB_RUNNING')) {
          const chunk = await reader.read()
          if (chunk.done) {
            throw new Error(
              output +
                (await new Response(job.stderr as ReadableStream).text()),
            )
          }
          output += new TextDecoder().decode(chunk.value)
        }
        cron.kill('SIGTERM')
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) {
            break
          }
          output += new TextDecoder().decode(chunk.value)
        }
        expect(await job.exited).toBe(1)
        expect(output).toContain('JOB_CLEANED_UP')
        expect(await cron.exited).toBe(0)
      } finally {
        job?.kill('SIGKILL')
        cron?.kill('SIGKILL')
        await rm(directory, { recursive: true, force: true })
      }
    },
    15000,
  )
})
