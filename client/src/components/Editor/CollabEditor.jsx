import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import Editor from '@monaco-editor/react'
import { useOT } from '../../hooks/useOT'

const MONACO_OPTIONS = {
  fontSize: 14,
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  fontLigatures: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: 'on',
  lineNumbers: 'on',
  renderLineHighlight: 'all',
  cursorBlinking: 'smooth',
  smoothScrolling: true,
  formatOnPaste: false,
  formatOnType: false,
  padding: { top: 16 },
  suggest: { preview: true },
  'bracketPairColorization.enabled': true,
}

const CollabEditor = forwardRef(function CollabEditor({
  socket, roomId, language, initialContent, initialRevision, onCodeChange,
}, ref) {
  const editorRef  = useRef(null)
  const monacoRef  = useRef(null)
  const mounted    = useRef(false)         // track if editor is ready
  const suppress   = useRef(false)   // block local onChange while applying remote edit
  const cursorTimer = useRef(null)   // debounce cursor broadcast
  const decorations = useRef({})     // socketId → IEditorDecorationsCollection

  const { sendOp, handleAck, handleRemoteOp, setRevision } = useOT(socket, roomId)

  // Initialise OT revision whenever room state arrives
  useEffect(() => {
    setRevision(initialRevision)
  }, [initialRevision, setRevision])

  // ── Remote op handler ─────────────────────────────────────────────
  const applyRemoteOp = useCallback((op) => {
    const transformed = handleRemoteOp(op)
    if (!transformed || !editorRef.current) return

    const editor = editorRef.current
    const model  = editor.getModel()
    if (!model) return

    // Save view state so cursor/scroll don't jump
    const viewState = editor.saveViewState()

    suppress.current = true
    try {
      if (transformed.type === 'insert') {
        const pos = Math.min(transformed.position, model.getValueLength())
        const start = model.getPositionAt(pos)
        model.applyEdits([{
          range: {
            startLineNumber: start.lineNumber, startColumn: start.column,
            endLineNumber: start.lineNumber,   endColumn: start.column,
          },
          text: transformed.text,
          forceMoveMarkers: true,
        }])
      } else if (transformed.type === 'delete') {
        const pos = Math.min(transformed.position, model.getValueLength())
        const end = Math.min(pos + transformed.length, model.getValueLength())
        const startPos = model.getPositionAt(pos)
        const endPos   = model.getPositionAt(end)
        model.applyEdits([{
          range: {
            startLineNumber: startPos.lineNumber, startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,     endColumn: endPos.column,
          },
          text: '',
          forceMoveMarkers: true,
        }])
      }
    } finally {
      suppress.current = false
    }

    // Restore scroll, but let cursor stay where Monaco puts it
    if (viewState) editor.restoreViewState(viewState)
    onCodeChange?.(model.getValue())
  }, [handleRemoteOp, onCodeChange])

  // ── Socket event listeners ────────────────────────────────────────
  useEffect(() => {
    if (!socket) return

    const onOp      = ({ op }) => applyRemoteOp(op)
    const onAck     = ({ revision }) => handleAck(revision)
    const onCursor  = (data) => drawRemoteCursor(data)
    const onLeft    = ({ socketId }) => clearCursor(socketId)

    socket.on('op',        onOp)
    socket.on('op-ack',    onAck)
    socket.on('cursor',    onCursor)
    socket.on('user-left', onLeft)

    return () => {
      socket.off('op',        onOp)
      socket.off('op-ack',    onAck)
      socket.off('cursor',    onCursor)
      socket.off('user-left', onLeft)
    }
  }, [socket, applyRemoteOp, handleAck])

  // ── Local change → OT op ─────────────────────────────────────────
  const handleChange = useCallback((_value, event) => {
    if (suppress.current || !socket) return
    for (const change of event.changes) {
      const { rangeOffset, rangeLength, text } = change
      if (rangeLength > 0) sendOp({ type: 'delete', position: rangeOffset, length: rangeLength })
      if (text.length   > 0) sendOp({ type: 'insert', position: rangeOffset, text })
    }
    onCodeChange?.(_value)
  }, [socket, sendOp, onCodeChange])

  // ── Cursor → broadcast (debounced 40ms) ──────────────────────────
  const handleCursorChange = useCallback((e) => {
    if (!socket || !editorRef.current) return
    clearTimeout(cursorTimer.current)
    cursorTimer.current = setTimeout(() => {
      const model = editorRef.current?.getModel()
      if (!model) return
      const position = model.getOffsetAt(e.position)
      const sel      = e.selection
      const selection = sel
        ? {
            start: model.getOffsetAt({ lineNumber: sel.startLineNumber, column: sel.startColumn }),
            end:   model.getOffsetAt({ lineNumber: sel.endLineNumber,   column: sel.endColumn }),
          }
        : null
      socket.emit('cursor', { position, selection })
    }, 40)
  }, [socket])

  // ── Remote cursor decorations ─────────────────────────────────────
  const drawRemoteCursor = useCallback(({ socketId, position, selection, username, color }) => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (!model) return

    const safePos  = Math.min(position ?? 0, model.getValueLength())
    const cursorAt = model.getPositionAt(safePos)
    const newDecos = []

    // Cursor line (thin coloured bar rendered via ::before CSS widget)
    newDecos.push({
      range: new monaco.Range(
        cursorAt.lineNumber, cursorAt.column,
        cursorAt.lineNumber, cursorAt.column,
      ),
      options: {
        className: `rc-cursor rc-${socketId.slice(0, 8)}`,
        zIndex: 100,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        hoverMessage: { value: username },
        beforeContentClassName: `rc-label rc-label-${socketId.slice(0, 8)}`,
      },
    })

    // Selection highlight
    if (selection && selection.start !== selection.end) {
      const sStart = model.getPositionAt(Math.min(selection.start, model.getValueLength()))
      const sEnd   = model.getPositionAt(Math.min(selection.end,   model.getValueLength()))
      newDecos.push({
        range: new monaco.Range(
          sStart.lineNumber, sStart.column,
          sEnd.lineNumber,   sEnd.column,
        ),
        options: {
          className: `rc-selection rc-sel-${socketId.slice(0, 8)}`,
          inlineClassName: `rc-sel-inline rc-sel-${socketId.slice(0, 8)}`,
        },
      })
    }

    // Apply / update decorations
    if (!decorations.current[socketId]) {
      decorations.current[socketId] = editor.createDecorationsCollection(newDecos)
    } else {
      decorations.current[socketId].set(newDecos)
    }

    // Inject per-user CSS (idempotent)
    const styleId = `rc-style-${socketId.slice(0, 8)}`
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style')
      s.id = styleId
      const hex = color || '#89b4fa'
      const id  = socketId.slice(0, 8)
      s.textContent = `
        .rc-${id}::after      { content:''; position:absolute; top:0; left:0; width:2px; height:1.4em; background:${hex}; }
        .rc-label-${id}::before { content:'${username.replace(/'/g, "\\'")}'; position:absolute; top:-1.4em; left:0; background:${hex}; color:#1e1e2e; font-size:10px; padding:0 4px; border-radius:3px 3px 3px 0; white-space:nowrap; pointer-events:none; z-index:200; }
        .rc-sel-${id}          { background:${hex}22 !important; }
      `
      document.head.appendChild(s)
    }
  }, [])

  const clearCursor = useCallback((socketId) => {
    decorations.current[socketId]?.clear()
    delete decorations.current[socketId]
    document.getElementById(`rc-style-${socketId.slice(0, 8)}`)?.remove()
  }, [])

  // ── Editor mount ─────────────────────────────────────────────────
  const handleMount = useCallback((editor, monaco) => {
    editorRef.current  = editor
    monacoRef.current  = monaco
    mounted.current = true

    editor.onDidChangeCursorPosition(handleCursorChange)
    editor.onDidChangeCursorSelection(handleCursorChange)

    // Inject base remote cursor CSS once
    if (!document.getElementById('rc-base')) {
      const s = document.createElement('style')
      s.id = 'rc-base'
      s.textContent = `.rc-cursor { position: relative; } .rc-label { position: relative; }`
      document.head.appendChild(s)
    }
  }, [handleCursorChange])

  // ── Expose setContent method via ref ─────────────────────────────
  useImperativeHandle(ref, () => ({
    setContent: (newContent) => {
      if (!mounted.current || !editorRef.current) {
        console.warn('[CollabEditor] Editor not mounted yet')
        return
      }
      const editor = editorRef.current
      const model = editor.getModel()
      if (!model) return
      suppress.current = true
      try {
        model.setValue(newContent)
      } finally {
        suppress.current = false
      }
      onCodeChange?.(newContent)
    },
  }), [onCodeChange])

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        height="100%"
        language={language}
        defaultValue={initialContent}
        theme="vs-dark"
        options={MONACO_OPTIONS}
        onChange={handleChange}
        onMount={handleMount}
      />
    </div>
  )
})

export default CollabEditor
