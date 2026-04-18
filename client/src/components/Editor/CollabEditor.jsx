// client/src/components/Editor/CollabEditor.jsx
import {
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import Editor from "@monaco-editor/react";
import { useOT } from "../../hooks/useOT";

const MONACO_OPTIONS = {
  fontSize: 14,
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  fontLigatures: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: "on",
  lineNumbers: "on",
  renderLineHighlight: "all",
  cursorBlinking: "smooth",
  smoothScrolling: true,
  formatOnPaste: false,
  formatOnType: false,
  padding: { top: 16 },
  suggest: { preview: true },
  "bracketPairColorization.enabled": true,
};

const CollabEditor = forwardRef(function CollabEditor(
  { socket, roomId, language, initialContent, initialRevision, onCodeChange, readOnly },
  ref,
) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const mounted = useRef(false); // track if editor is ready
  const suppress = useRef(false); // block local onChange while applying remote edit
  const cursorTimer = useRef(null); // debounce cursor broadcast
  const decorations = useRef({}); // socketId → IEditorDecorationsCollection
  const contentDirty = useRef(false); // whether content changed since last sync
  const syncTimer = useRef(null); // periodic content sync timer

  const { sendOp, handleAck, handleRemoteOp, setRevision } = useOT(
    socket,
    roomId,
  );

  // Initialise OT revision whenever room state arrives
  useEffect(() => {
    setRevision(initialRevision);
  }, [initialRevision, setRevision]);

  // ── Periodic content sync to server ───────────────────────────────
  // Every 3 seconds, if content changed, send the full content to the server.
  // This ensures the server always has the correct content for persistence,
  // regardless of any OT drift.
  useEffect(() => {
    if (!socket || !roomId) return;

    syncTimer.current = setInterval(() => {
      if (contentDirty.current && editorRef.current) {
        const model = editorRef.current.getModel();
        if (model) {
          const content = model.getValue();
          socket.emit("sync-content", { roomId, language, content });
          contentDirty.current = false;
        }
      }
    }, 3000);

    return () => {
      clearInterval(syncTimer.current);
    };
  }, [socket, roomId, language]);

  // ── Remote op handler ─────────────────────────────────────────────
  const applyRemoteOp = useCallback(
    (op) => {
      const transformed = handleRemoteOp(op);
      if (!transformed || !editorRef.current) return;

      const editor = editorRef.current;
      const model = editor.getModel();
      if (!model) return;

      // Save view state so cursor/scroll don't jump
      const viewState = editor.saveViewState();

      suppress.current = true;
      try {
        if (transformed.type === "insert") {
          const pos = Math.min(transformed.position, model.getValueLength());
          const start = model.getPositionAt(pos);
          if (!start) return;
          model.applyEdits([
            {
              range: {
                startLineNumber: start.lineNumber,
                startColumn: start.column,
                endLineNumber: start.lineNumber,
                endColumn: start.column,
              },
              text: transformed.text,
              forceMoveMarkers: true,
            },
          ]);
        } else if (transformed.type === "delete") {
          const pos = Math.min(transformed.position, model.getValueLength());
          const end = Math.min(
            pos + transformed.length,
            model.getValueLength(),
          );
          const startPos = model.getPositionAt(pos);
          const endPos = model.getPositionAt(end);
          if (!startPos || !endPos) return;
          model.applyEdits([
            {
              range: {
                startLineNumber: startPos.lineNumber,
                startColumn: startPos.column,
                endLineNumber: endPos.lineNumber,
                endColumn: endPos.column,
              },
              text: "",
              forceMoveMarkers: true,
            },
          ]);
        }
      } finally {
        suppress.current = false;
      }

      // Restore scroll, but let cursor stay where Monaco puts it
      if (viewState) {
        try {
          editor.restoreViewState(viewState);
        } catch (_) {
          // View state might be stale if model changed beneath us
        }
      }
      onCodeChange?.(model.getValue());
    },
    [handleRemoteOp, onCodeChange],
  );

  // ── Socket event listeners ────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onOp = ({ op }) => applyRemoteOp(op);
    const onAck = ({ revision }) => handleAck(revision);
    const onCursor = (data) => drawRemoteCursor(data);
    const onLeft = ({ socketId }) => clearCursor(socketId);

    socket.on("op", onOp);
    socket.on("op-ack", onAck);
    socket.on("cursor", onCursor);
    socket.on("user-left", onLeft);

    return () => {
      socket.off("op", onOp);
      socket.off("op-ack", onAck);
      socket.off("cursor", onCursor);
      socket.off("user-left", onLeft);
    };
  }, [socket, applyRemoteOp, handleAck]);

  // ── Local change → OT op ─────────────────────────────────────────
  const handleChange = useCallback(
    (_value, event) => {
      if (suppress.current || !socket) return;

      for (const change of event.changes) {
        const { rangeOffset, rangeLength, text } = change;

        if (rangeLength > 0 && text.length > 0) {
          // This is a REPLACE operation (e.g., autocomplete replacing "Sys" with "System").
          // Send as delete then insert. Both positions are rangeOffset (pre-change offset).
          sendOp({
            type: "delete",
            position: rangeOffset,
            length: rangeLength,
          });
          sendOp({ type: "insert", position: rangeOffset, text });
        } else if (rangeLength > 0) {
          sendOp({
            type: "delete",
            position: rangeOffset,
            length: rangeLength,
          });
        } else if (text.length > 0) {
          sendOp({ type: "insert", position: rangeOffset, text });
        }
      }

      contentDirty.current = true;
      onCodeChange?.(_value);
    },
    [socket, sendOp, onCodeChange],
  );

  // ── Cursor → broadcast (debounced 40ms) ──────────────────────────
  const handleCursorChange = useCallback(
    (e) => {
      if (!socket || !editorRef.current) return;
      clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const model = editor.getModel();
        if (!model) return;

        try {
          const position = model.getOffsetAt(e.position);
          const sel = e.selection;
          const selection = sel
            ? {
                start: model.getOffsetAt({
                  lineNumber: sel.startLineNumber,
                  column: sel.startColumn,
                }),
                end: model.getOffsetAt({
                  lineNumber: sel.endLineNumber,
                  column: sel.endColumn,
                }),
              }
            : null;
          socket.emit("cursor", { position, selection });
        } catch (_) {
          // Model may be disposed during editor re-key
        }
      }, 40);
    },
    [socket],
  );

  // ── Remote cursor decorations ─────────────────────────────────────
  const drawRemoteCursor = useCallback(
    ({ socketId, position, selection, username, color }) => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;
      const model = editor.getModel();
      if (!model) return;

      const safePos = Math.min(position ?? 0, model.getValueLength());
      const cursorAt = model.getPositionAt(safePos);
      if (!cursorAt) return;
      const newDecos = [];

      // Cursor line (thin coloured bar rendered via ::before CSS widget)
      newDecos.push({
        range: new monaco.Range(
          cursorAt.lineNumber,
          cursorAt.column,
          cursorAt.lineNumber,
          cursorAt.column,
        ),
        options: {
          className: `rc-cursor rc-${socketId.slice(0, 8)}`,
          zIndex: 100,
          stickiness:
            monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          hoverMessage: { value: username },
          beforeContentClassName: `rc-label rc-label-${socketId.slice(0, 8)}`,
        },
      });

      // Selection highlight
      if (selection && selection.start !== selection.end) {
        const sStart = model.getPositionAt(
          Math.min(selection.start, model.getValueLength()),
        );
        const sEnd = model.getPositionAt(
          Math.min(selection.end, model.getValueLength()),
        );
        if (sStart && sEnd) {
          newDecos.push({
            range: new monaco.Range(
              sStart.lineNumber,
              sStart.column,
              sEnd.lineNumber,
              sEnd.column,
            ),
            options: {
              className: `rc-selection rc-sel-${socketId.slice(0, 8)}`,
              inlineClassName: `rc-sel-inline rc-sel-${socketId.slice(0, 8)}`,
            },
          });
        }
      }

      // Apply / update decorations
      if (!decorations.current[socketId]) {
        decorations.current[socketId] =
          editor.createDecorationsCollection(newDecos);
      } else {
        decorations.current[socketId].set(newDecos);
      }

      // Inject per-user CSS (idempotent)
      const styleId = `rc-style-${socketId.slice(0, 8)}`;
      if (!document.getElementById(styleId)) {
        const s = document.createElement("style");
        s.id = styleId;
        const hex = color || "#89b4fa";
        const id = socketId.slice(0, 8);
        s.textContent = `
        .rc-${id}::after      { content:''; position:absolute; top:0; left:0; width:2px; height:1.4em; background:${hex}; }
        .rc-label-${id}::before { content:'${username.replace(/'/g, "\\'")}'; position:absolute; top:-1.4em; left:0; background:${hex}; color:#1e1e2e; font-size:10px; padding:0 4px; border-radius:3px 3px 3px 0; white-space:nowrap; pointer-events:none; z-index:200; }
        .rc-sel-${id}          { background:${hex}22 !important; }
      `;
        document.head.appendChild(s);
      }
    },
    [],
  );

  const clearCursor = useCallback((socketId) => {
    decorations.current[socketId]?.clear();
    delete decorations.current[socketId];
    document.getElementById(`rc-style-${socketId.slice(0, 8)}`)?.remove();
  }, []);

  // ── Editor mount ─────────────────────────────────────────────────
  const handleMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      mounted.current = true;

      // Force LF line endings
      const model = editor.getModel();
      if (model) {
        suppress.current = true;
        try {
          model.setEOL(0); // monaco.editor.EndOfLineSequence.LF
        } finally {
          suppress.current = false;
        }
      }

      editor.onDidChangeCursorPosition(handleCursorChange);
      editor.onDidChangeCursorSelection(handleCursorChange);

      // Inject base remote cursor CSS once
      if (!document.getElementById("rc-base")) {
        const s = document.createElement("style");
        s.id = "rc-base";
        s.textContent = `.rc-cursor { position: relative; } .rc-label { position: relative; }`;
        document.head.appendChild(s);
      }
    },
    [handleCursorChange],
  );

  // ── Expose methods via ref ───────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      setContent: (newContent) => {
        if (!mounted.current || !editorRef.current) {
          // Editor not ready yet — will get the content from defaultValue on next re-key
          return;
        }
        const editor = editorRef.current;
        const model = editor.getModel();
        if (!model) return;
        suppress.current = true;
        try {
          const normalizedContent = (newContent || "").replace(/\r\n/g, "\n");
          if (model.getValue() !== normalizedContent) {
            model.setValue(normalizedContent);
          }
        } finally {
          suppress.current = false;
        }
        onCodeChange?.(newContent);
      },
      // Return the current editor content (used for pre-disconnect sync)
      getContent: () => {
        if (!mounted.current || !editorRef.current) return null;
        const model = editorRef.current.getModel();
        return model ? model.getValue() : null;
      },
    }),
    [onCodeChange],
  );

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        key={`${roomId}-${language}-${initialRevision}`}
        height="100%"
        language={language}
        defaultValue={(initialContent || "").replace(/\r\n/g, "\n")}
        theme="vs-dark"
        options={{ ...MONACO_OPTIONS, readOnly }}
        onChange={handleChange}
        onMount={handleMount}
      />
    </div>
  );
});

export default CollabEditor;
