// server/src/utils/ot.js
/**
 * Operational Transform Engine
 * Supports insert and delete operations with transform against concurrent ops.
 * Each op: { type: 'insert'|'delete', position: number, text?: string, length?: number, revision: number, userId: string }
 */

class OTEngine {
  constructor(initialContent = "", initialRevision = 0) {
    this.content = initialContent;
    this.revision = initialRevision;
    this.history = []; // ops since last snapshot
  }

  /**
   * Apply an incoming op from a client at the given client revision.
   * Returns the transformed op that was actually applied, or null if rejected.
   */
  applyOp(op, clientRevision) {
    // Get all ops the client hasn't seen
    const sliceStart = clientRevision - (this.revision - this.history.length);
    const concurrentOps = this.history.slice(sliceStart);

    let transformed = { ...op };

    for (const serverOp of concurrentOps) {
      transformed = this._transform(transformed, serverOp);
      if (!transformed) return null;
    }

    // Apply the transformed op
    this.content = this._apply(this.content, transformed);
    this.revision++;
    transformed.revision = this.revision;

    this.history.push(transformed);

    // Keep only last 1000 ops to avoid unbounded memory
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }

    return transformed;
  }

  /**
   * Transform op1 against op2 (both concurrent) → op1'
   */
  _transform(op1, op2) {
    if (op1.type === "insert" && op2.type === "insert") {
      if (
        op2.position < op1.position ||
        (op2.position === op1.position && op2.userId < op1.userId)
      ) {
        return { ...op1, position: op1.position + op2.text.length };
      }
      return op1;
    }

    if (op1.type === "insert" && op2.type === "delete") {
      if (op2.position + op2.length <= op1.position) {
        return { ...op1, position: op1.position - op2.length };
      }
      if (op2.position < op1.position) {
        return { ...op1, position: op2.position };
      }
      return op1;
    }

    if (op1.type === "delete" && op2.type === "insert") {
      // op2 inserted BEFORE op1's start — shift op1 right
      if (op2.position <= op1.position) {
        return { ...op1, position: op1.position + op2.text.length };
      }
      // op2 inserted INSIDE op1's range — expand op1 length to cover the new chars
      if (op2.position < op1.position + op1.length) {
        return { ...op1, length: op1.length + op2.text.length };
      }
      // op2 inserted AFTER op1 — no change
      return op1;
    }

    if (op1.type === "delete" && op2.type === "delete") {
      const op1End = op1.position + op1.length;
      const op2End = op2.position + op2.length;

      // op2 is entirely before op1 — shift op1 left
      if (op2End <= op1.position) {
        return { ...op1, position: op1.position - op2.length };
      }
      // op2 is entirely after op1 — no change
      if (op2.position >= op1End) {
        return op1;
      }
      // Overlapping deletes — remove the already-deleted portion from op1
      // op1 keeps only the chars outside op2's range
      const newPos = Math.min(op1.position, op2.position);
      const overlapStart = Math.max(op1.position, op2.position);
      const overlapEnd = Math.min(op1End, op2End);
      const overlap = overlapEnd - overlapStart;
      const newLength = op1.length - overlap;
      if (newLength <= 0) return null; // completely consumed by op2
      return { ...op1, position: newPos, length: newLength };
    }

    return op1;
  }

  _apply(content, op) {
    if (op.type === "insert") {
      const pos = Math.min(op.position, content.length);
      return content.slice(0, pos) + op.text + content.slice(pos);
    }
    if (op.type === "delete") {
      const pos = Math.min(op.position, content.length);
      const end = Math.min(pos + op.length, content.length);
      return content.slice(0, pos) + content.slice(end);
    }
    return content;
  }

  getSnapshot() {
    return { content: this.content, revision: this.revision };
  }
}

module.exports = OTEngine;
