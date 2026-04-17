import { X, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react'

export default function OutputPanel({ output, executing, onClose, onRun }) {
  const success = output?.exitCode === 0
  const hasOutput = output?.stdout || output?.stderr

  return (
    <section className="h-56 bg-editor-sidebar border-t border-editor-border flex flex-col shrink-0">

      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-editor-border shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-editor-muted">Output</span>

          {output && !executing && (
            <div className="flex items-center gap-2 text-xs">
              {success
                ? <CheckCircle2 size={12} className="text-editor-green" />
                : <XCircle      size={12} className="text-editor-red"   />
              }
              <span className={success ? 'text-editor-green' : 'text-editor-red'}>
                Exit {output.exitCode}
              </span>
              {output.executionTime > 0 && (
                <span className="text-editor-muted flex items-center gap-0.5">
                  <Clock size={11} />
                  {output.executionTime}ms
                </span>
              )}
              {output.timedOut && (
                <span className="text-editor-yellow">· timed out</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onRun}
            disabled={executing}
            title="Re-run"
            className="p-1 text-editor-muted hover:text-editor-text transition-colors disabled:opacity-40"
          >
            <RefreshCw size={13} className={executing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="p-1 text-editor-muted hover:text-editor-text transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Output body */}
      <div className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed">
        {executing && !output && (
          <span className="text-editor-muted animate-pulse">Running…</span>
        )}

        {!executing && !hasOutput && output && (
          <span className="text-editor-muted italic">(no output)</span>
        )}

        {!executing && !output && (
          <span className="text-editor-muted">Click Run ▷ to execute the code in this room.</span>
        )}

        {output?.compilationError && (
          <p className="text-editor-yellow mb-1">Compilation error:</p>
        )}

        {output?.stdout && (
          <pre className="text-editor-text whitespace-pre-wrap break-all">{output.stdout}</pre>
        )}

        {output?.stderr && (
          <pre className={`whitespace-pre-wrap break-all ${output.compilationError ? 'text-editor-yellow' : 'text-editor-red'}`}>
            {output.stderr}
          </pre>
        )}
      </div>
    </section>
  )
}
