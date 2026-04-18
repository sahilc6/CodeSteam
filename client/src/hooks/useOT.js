// client/src/hooks/useOT.js
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
    buffer:  [],     // ops queued locally while pending is in-flight
  })

  // ── Send local op ─────────────────────────────────────────────────
  const sendOp = useCallback((op) => {
    const s = state.current

    if (!s.pending) {
      // SYNC → send immediately
      s.pending = { ...op, revision: s.revision }
      socket?.emit('op', { op: s.pending, roomId })
    } else {
      // AWAITING → buffer the op until pending is acked
      s.buffer.push({ ...op })
    }
  }, [socket, roomId])

  // ── Server acknowledged our pending op ───────────────────────────
  const handleAck = useCallback((serverRevision) => {
    const s = state.current
    s.revision = serverRevision

    if (s.buffer.length > 0) {
      // Flush next buffered op: it becomes the new pending
      const nextOp = s.buffer.shift()
      s.pending = { ...nextOp, revision: s.revision }
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
      if (tPending) {
        s.pending = tPending
      } else {
        s.pending = null
      }
    }

    const newBuffer = []
    for (const bOp of s.buffer) {
      const [tIncoming, tBufferOp] = xform(incoming, bOp)
      // incoming is transformed against bOp, because bOp precedes future ops
      incoming = tIncoming
      if (tBufferOp) {
        newBuffer.push(tBufferOp)
      }
    }
    s.buffer = newBuffer

    s.revision = remoteOp.revision
    return incoming
  }, [])

  const setRevision = useCallback((rev) => {
    state.current.revision = rev
    state.current.pending  = null
    state.current.buffer   = []
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
