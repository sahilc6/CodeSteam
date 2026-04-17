const { runCode } = require('../../sandbox/runner')

// Increase timeout for compilation steps
jest.setTimeout(30000)

describe('Sandbox runner', () => {
  // ── JavaScript ──────────────────────────────────────────────────────
  describe('JavaScript', () => {
    test('hello world', async () => {
      const r = await runCode('javascript', 'console.log("hello world")')
      expect(r.stdout.trim()).toBe('hello world')
      expect(r.exitCode).toBe(0)
    })

    test('arithmetic output', async () => {
      const r = await runCode('javascript', 'console.log(2 + 2)')
      expect(r.stdout.trim()).toBe('4')
    })

    test('stdin is readable', async () => {
      const r = await runCode('javascript', `
        const lines = require('fs').readFileSync('/dev/stdin','utf8').trim()
        console.log('got: ' + lines)
      `, 'testinput')
      expect(r.stdout).toContain('got: testinput')
    })

    test('runtime error captured in stderr', async () => {
      const r = await runCode('javascript', 'throw new Error("boom")')
      expect(r.exitCode).not.toBe(0)
      expect(r.stderr).toContain('boom')
    })

    test('infinite loop times out', async () => {
      const r = await runCode('javascript', 'while(true){}')
      expect(r.timedOut).toBe(true)
      expect(r.exitCode).toBe(-1)
    })
  })

  // ── Python ──────────────────────────────────────────────────────────
  describe('Python', () => {
    test('hello world', async () => {
      const r = await runCode('python', 'print("hello from python")')
      expect(r.stdout.trim()).toBe('hello from python')
      expect(r.exitCode).toBe(0)
    })

    test('loops and arithmetic', async () => {
      const r = await runCode('python', 'print(sum(range(10)))')
      expect(r.stdout.trim()).toBe('45')
    })

    test('syntax error reported', async () => {
      const r = await runCode('python', 'def broken(:')
      expect(r.exitCode).not.toBe(0)
      expect(r.stderr.length).toBeGreaterThan(0)
    })

    test('multiline output', async () => {
      const r = await runCode('python', 'for i in range(3): print(i)')
      expect(r.stdout.trim()).toBe('0\n1\n2')
    })
  })

  // ── Bash ────────────────────────────────────────────────────────────
  describe('Bash', () => {
    test('echo', async () => {
      const r = await runCode('bash', 'echo "hello bash"')
      expect(r.stdout.trim()).toBe('hello bash')
      expect(r.exitCode).toBe(0)
    })

    test('arithmetic', async () => {
      const r = await runCode('bash', 'echo $((3 * 7))')
      expect(r.stdout.trim()).toBe('21')
    })

    test('non-zero exit code for bad command', async () => {
      const r = await runCode('bash', 'exit 42')
      expect(r.exitCode).toBe(42)
    })
  })

  // ── Security ────────────────────────────────────────────────────────
  describe('Sandbox security', () => {
    test('cannot write outside tmpdir (Python)', async () => {
      const r = await runCode('python', `
f = open('/etc/evil', 'w')
f.write('pwned')
`)
      expect(r.exitCode).not.toBe(0)
    })

    test('output is capped at 100KB', async () => {
      const r = await runCode('javascript', `
        process.stdout.write('x'.repeat(200 * 1024))
      `)
      expect(r.stdout.length).toBeLessThanOrEqual(100001)
    })

    test('unsupported language throws', async () => {
      await expect(runCode('cobol', 'DISPLAY "hi"')).rejects.toThrow('Unsupported language')
    })
  })

  // ── Execution metadata ───────────────────────────────────────────────
  describe('Execution metadata', () => {
    test('executionTime is returned', async () => {
      const r = await runCode('javascript', 'console.log(1)')
      expect(typeof r.executionTime).toBe('number')
      expect(r.executionTime).toBeGreaterThan(0)
    })

    test('exitCode 0 on success', async () => {
      const r = await runCode('python', 'print("ok")')
      expect(r.exitCode).toBe(0)
    })

    test('stdout and stderr are strings', async () => {
      const r = await runCode('javascript', 'console.log("a"); console.error("b")')
      expect(typeof r.stdout).toBe('string')
      expect(typeof r.stderr).toBe('string')
    })
  })
})
