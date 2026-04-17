import { useRef, useCallback } from 'react'

/**
 * Client-side OT state machine — three-state: synchronized, awaiting-ack, buffered.
 *
 * State machine:
 *   SYNC      → sendOp → send to server, move to AWAITING
 *   AWAITING  → sendOp → buffer the op, move to BUFFERED
 *   BUFFERED  → sendOp → compose into buffer (still BUFFERED)
 *   AWAITING  → ack    → resend buffer (if any), move to AWAITING or SYNC
 *   BUFFERED  → ack    → send buffer, move to AWAITING
 *
 * All incoming remote ops are transformed against pending + buffer before
 * being returned to the caller for application to the document.
 */
export function useOT(socket, roomId) {
  const state = useRef({
    revision: 0,
    pending: null,   // op in-flight to server, awaiting ack
    buffer:  null,   // op composed locally while pending is in-flight
  })

  // ── Send local op ─────────────────────────────────────────────────
  const sendOp = useCallback((op) => {
    const s = state.current
    op.revision = s.revision

    if (!s.pending) {
      // SYNC → send immediately
      s.pending = { ...op }
      socket?.emit('op', { op: s.pending, roomId })
    } else if (!s.buffer) {
      // AWAITING → buffer
      s.buffer = { ...op }
    } else {
      // BUFFERED → compose into buffer
      s.buffer = composeOps(s.buffer, op)
    }
  }, [socket, roomId])

  // ── Server acknowledged our pending op ───────────────────────────
  const handleAck = useCallback((serverRevision) => {
    const s = state.current
    s.revision = serverRevision

    if (s.buffer) {
      // Flush buffer: it becomes the new pending
      s.pending = { ...s.buffer, revision: s.revision }
      s.buffer = null
      socket?.emit('op', { op: s.pending, roomId })
    } else {
      s.pending = null
    }
  }, [socket, roomId])

  // ── Incoming remote op (needs transform against pending/buffer) ───
  const handleRemoteOp = useCallback((remoteOp) => {
    const s = state.current
    let incoming = { ...remoteOp }

    if (s.pending) {
      const [tIncoming, tPending] = xform(incoming, s.pending)
      incoming   = tIncoming
      s.pending  = tPending
    }

    if (s.buffer) {
      const [tIncoming, tBuffer] = xform(incoming, s.buffer)
      incoming  = tIncoming
      s.buffer  = tBuffer
    }

    s.revision = remoteOp.revision
    return incoming
  }, [])

  const setRevision = useCallback((rev) => {
    state.current.revision = rev
    state.current.pending  = null
    state.current.buffer   = null
  }, [])

  return { sendOp, handleAck, handleRemoteOp, setRevision }
}

// ── Operational Transform: xform(clientOp, serverOp) → [clientOp', serverOp'] ──
function xform(a, b) {
  if (!a || !b) return [a, b]

  // insert vs insert
  if (a.type === 'insert' && b.type === 'insert') {
    if (a.position < b.position) {
      return [a, { ...b, position: b.position + a.text.length }]
    }
    if (a.position > b.position) {
      return [{ ...a, position: a.position + b.text.length }, b]
    }
    // same position — deterministic tiebreak by userId
    if ((a.userId || '') <= (b.userId || '')) {
      return [a, { ...b, position: b.position + a.text.length }]
    }
    return [{ ...a, position: a.position + b.text.length }, b]
  }

  // insert vs delete
  if (a.type === 'insert' && b.type === 'delete') {
    const bEnd = b.position + b.length
    if (a.position <= b.position) {
      return [a, { ...b, position: b.position + a.text.length }]
    }
    if (a.position > bEnd) {
      return [{ ...a, position: a.position - b.length }, b]
    }
    // a.position is inside the deleted range — clamp to deletion start
    return [{ ...a, position: b.position }, b]
  }

  // delete vs insert
  if (a.type === 'delete' && b.type === 'insert') {
    const aEnd = a.position + a.length
    if (b.position <= a.position) {
      return [{ ...a, position: a.position + b.text.length }, b]
    }
    if (b.position >= aEnd) {
      return [a, { ...b, position: b.position - a.length }]
    }
    // insert inside delete range — expand delete to include inserted text
    return [
      { ...a, length: a.length + b.text.length },
      { ...b, position: b.position + a.length },
    ]
  }

  // delete vs delete
  if (a.type === 'delete' && b.type === 'delete') {
    const aEnd = a.position + a.length
    const bEnd = b.position + b.length

    if (aEnd <= b.position) {
      // a entirely before b
      return [a, { ...b, position: b.position - a.length }]
    }
    if (bEnd <= a.position) {
      // b entirely before a
      return [{ ...a, position: a.position - b.length }, b]
    }

    // Overlapping — each shrinks by the overlap it shares with the other
    const overlapStart = Math.max(a.position, b.position)
    const overlapEnd   = Math.min(aEnd, bEnd)
    const overlap      = overlapEnd - overlapStart

    const aNew = { ...a, length: a.length - overlap }
    const bNew = { ...b, length: b.length - overlap }

    // Shift whichever starts later to account for what the other already removed
    const aPos = a.position <= b.position ? a.position : Math.max(a.position - b.length + overlap, b.position)
    const bPos = b.position <= a.position ? b.position : Math.max(b.position - a.length + overlap, a.position)

    return [
      aNew.length <= 0 ? null : { ...aNew, position: aPos },
      bNew.length <= 0 ? null : { ...bNew, position: bPos },
    ]
  }

  return [a, b]
}

// Compose two sequential ops from the same client into one.
// For the simple case (used only for buffered ops), the later op wins.
function composeOps(op1, op2) {
  // If both are inserts at adjacent positions, merge text
  if (op1.type === 'insert' && op2.type === 'insert') {
    if (op2.position === op1.position + op1.text.length) {
      return { ...op1, text: op1.text + op2.text }
    }
  }
  // If both are deletes at same start, merge lengths
  if (op1.type === 'delete' && op2.type === 'delete') {
    if (op2.position === op1.position) {
      return { ...op1, length: op1.length + op2.length }
    }
  }
  // Otherwise keep the later op (covers the common backspace case)
  return op2
}
