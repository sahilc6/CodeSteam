const { spawn } = require('child_process')
const fs = require('fs/promises')
const path = require('path')
const os = require('os')
const { v4: uuidv4 } = require('uuid')
const logger = require('../utils/logger')

const TIMEOUT_MS = parseInt(process.env.SANDBOX_TIMEOUT_MS) || 10000
const MAX_OUTPUT_BYTES = 100 * 1024          // 100 KB
const MAX_CODE_BYTES = 50 * 1024             // 50 KB input cap

const LANGUAGE_CONFIG = {
  javascript: {
    ext: 'js',
    run: (f) => ({ cmd: 'node', args: ['--max-old-space-size=128', f] }),
  },
  typescript: {
    ext: 'ts',
    fallbackRun: (f) => ({ cmd: 'npx', args: ['--yes', 'ts-node', '--transpile-only', f] }),
  },
  python: {
    ext: 'py',
    run: (f) => ({ cmd: 'python3', args: ['-u', f] }),
  },
  ruby: {
    ext: 'rb',
    run: (f) => ({ cmd: 'ruby', args: [f] }),
  },
  php: {
    ext: 'php',
    run: (f) => ({ cmd: 'php', args: [f] }),
  },
  bash: {
    ext: 'sh',
    run: (f) => ({ cmd: 'bash', args: [f] }),
  },
  go: {
    ext: 'go',
    run: (f) => ({ cmd: 'go', args: ['run', f] }),
  },
  java: { ext: 'java', compiled: true },
  cpp:  { ext: 'cpp',  compiled: true },
  c:    { ext: 'c',    compiled: true },
  rust: { ext: 'rs',   compiled: true },
}

const COMPILE_STEPS = {
  cpp: {
    compile: (src, out) => ({ cmd: 'g++', args: ['-O2', '-std=c++17', src, '-o', out] }),
    run: (out) => ({ cmd: out, args: [] }),
  },
  c: {
    compile: (src, out) => ({ cmd: 'gcc', args: ['-O2', src, '-o', out, '-lm'] }),
    run: (out) => ({ cmd: out, args: [] }),
  },
  rust: {
    compile: (src, out) => ({ cmd: 'rustc', args: ['-O', src, '-o', out] }),
    run: (out) => ({ cmd: out, args: [] }),
  },
  java: {
    compile: (src, _out, dir) => ({ cmd: 'javac', args: ['-d', dir, src] }),
    run: (_out, dir) => ({ cmd: 'java', args: ['-cp', dir, '-Xmx128m', 'Main'] }),
    rename: 'Main.java',
  },
}

async function runCode(language, code, stdin = '') {
  const config = LANGUAGE_CONFIG[language]
  if (!config) throw new Error(`Unsupported language: ${language}`)

  if (Buffer.byteLength(code) > MAX_CODE_BYTES) {
    return { stdout: '', stderr: 'Code exceeds maximum allowed size (50 KB).', exitCode: -1 }
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-'))

  try {
    const fileName = (config.compiled && COMPILE_STEPS[language]?.rename)
      ? COMPILE_STEPS[language].rename
      : `main.${config.ext}`
    const filePath = path.join(tmpDir, fileName)
    await fs.writeFile(filePath, code, 'utf8')

    if (config.compiled) {
      return await runCompiled(language, filePath, tmpDir, stdin)
    }

    const runner = config.run || config.fallbackRun
    const { cmd, args } = runner(filePath)
    return await exec(cmd, args, stdin, tmpDir)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function runCompiled(language, srcPath, tmpDir, stdin) {
  const steps = COMPILE_STEPS[language]
  const outPath = path.join(tmpDir, 'program')

  const { cmd: cc, args: cargs } = steps.compile(srcPath, outPath, tmpDir)
  const compileResult = await exec(cc, cargs, '', tmpDir)

  if (compileResult.exitCode !== 0) {
    return {
      ...compileResult,
      stdout: '',
      stderr: `Compilation error:\n${compileResult.stderr}`,
      compilationError: true,
    }
  }

  const { cmd: rc, args: rargs } = steps.run(outPath, tmpDir)
  return await exec(rc, rargs, stdin, tmpDir)
}

function exec(cmd, args, stdin, cwd) {
  return new Promise((resolve) => {
    const chunks = { out: [], err: [] }
    let outBytes = 0
    let errBytes = 0
    let killed = false
    const startTime = Date.now()

    const proc = spawn(cmd, args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: os.tmpdir(),
        TMPDIR: cwd,
        LANG: 'en_US.UTF-8',
      },
      detached: false,
    })

    const killTimer = setTimeout(() => {
      killed = true
      try { proc.kill('SIGKILL') } catch {}
    }, TIMEOUT_MS)

    if (stdin) proc.stdin.write(stdin, 'utf8')
    proc.stdin.end()

    proc.stdout.on('data', (chunk) => {
      outBytes += chunk.length
      if (outBytes <= MAX_OUTPUT_BYTES) chunks.out.push(chunk)
    })

    proc.stderr.on('data', (chunk) => {
      errBytes += chunk.length
      if (errBytes <= 10240) chunks.err.push(chunk)
    })

    proc.on('close', (code, signal) => {
      clearTimeout(killTimer)
      const stdout = Buffer.concat(chunks.out).toString('utf8')
      const stderr = Buffer.concat(chunks.err).toString('utf8')
      const timedOut = killed || signal === 'SIGKILL' || signal === 'SIGTERM'

      resolve({
        stdout: outBytes > MAX_OUTPUT_BYTES
          ? stdout + `\n[Output truncated at ${MAX_OUTPUT_BYTES / 1024}KB]`
          : stdout,
        stderr: timedOut ? 'Execution timed out.' : stderr,
        exitCode: timedOut ? -1 : (code ?? -1),
        signal: signal || null,
        executionTime: Date.now() - startTime,
        timedOut,
      })
    })

    proc.on('error', (err) => {
      clearTimeout(killTimer)
      logger.warn(`exec spawn error [${cmd}]: ${err.message}`)
      resolve({
        stdout: '',
        stderr: `Could not run '${cmd}': ${err.message}\nMake sure the runtime is installed on the server.`,
        exitCode: -1,
        executionTime: Date.now() - startTime,
        timedOut: false,
      })
    })
  })
}

module.exports = { runCode }
