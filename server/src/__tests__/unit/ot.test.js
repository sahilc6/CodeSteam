const OTEngine = require('../../utils/ot')

describe('OTEngine', () => {
  // ── Basic apply ────────────────────────────────────────────────────
  describe('applyOp – no concurrency', () => {
    test('insert into empty document', () => {
      const e = new OTEngine()
      e.applyOp({ type: 'insert', position: 0, text: 'hello', revision: 0, userId: 'a' }, 0)
      expect(e.content).toBe('hello')
      expect(e.revision).toBe(1)
    })

    test('insert at end', () => {
      const e = new OTEngine('hello')
      e.applyOp({ type: 'insert', position: 5, text: ' world', revision: 0, userId: 'a' }, 0)
      expect(e.content).toBe('hello world')
    })

    test('insert in middle', () => {
      const e = new OTEngine('helo')
      e.applyOp({ type: 'insert', position: 3, text: 'l', revision: 0, userId: 'a' }, 0)
      expect(e.content).toBe('hello')
    })

    test('delete single char', () => {
      const e = new OTEngine('hello')
      e.applyOp({ type: 'delete', position: 4, length: 1, revision: 0, userId: 'a' }, 0)
      expect(e.content).toBe('hell')
    })

    test('delete range', () => {
      const e = new OTEngine('hello world')
      e.applyOp({ type: 'delete', position: 5, length: 6, revision: 0, userId: 'a' }, 0)
      expect(e.content).toBe('hello')
    })

    test('insert clamps past end', () => {
      const e = new OTEngine('hi')
      e.applyOp({ type: 'insert', position: 100, text: '!', revision: 0, userId: 'a' }, 0)
      expect(e.content).toBe('hi!')
    })

    test('sequential ops build correct string', () => {
      const e = new OTEngine()
      e.applyOp({ type: 'insert', position: 0, text: 'foo', revision: 0, userId: 'a' }, 0)
      e.applyOp({ type: 'insert', position: 3, text: 'bar', revision: 1, userId: 'a' }, 1)
      e.applyOp({ type: 'delete', position: 0, length: 3, revision: 2, userId: 'a' }, 2)
      expect(e.content).toBe('bar')
      expect(e.revision).toBe(3)
    })
  })

  // ── Transform: insert vs insert ────────────────────────────────────
  describe('transform – insert vs insert (concurrent)', () => {
    test('two inserts at same position – lower userId wins tiebreak', () => {
      const e = new OTEngine('ab')
      // Server op: user 'a' inserts 'X' at 1 (revision 0)
      e.applyOp({ type: 'insert', position: 1, text: 'X', revision: 0, userId: 'a' }, 0)
      expect(e.content).toBe('aXb')

      // Client op: user 'b' also inserts 'Y' at 1, but hasn't seen server op yet
      const transformed = e.applyOp({ type: 'insert', position: 1, text: 'Y', revision: 0, userId: 'b' }, 0)
      // 'a' < 'b' so server's 'X' was already placed at 1, pushing 'Y' right
      expect(e.content).toBe('aXYb')
      expect(transformed.position).toBe(2)
    })

    test('non-overlapping inserts – no position shift needed', () => {
      const e = new OTEngine('abc')
      e.applyOp({ type: 'insert', position: 0, text: 'X', revision: 0, userId: 'a' }, 0)
      const transformed = e.applyOp({ type: 'insert', position: 3, text: 'Y', revision: 0, userId: 'b' }, 0)
      expect(e.content).toBe('XabcY')
      expect(transformed.position).toBe(4) // shifted right by X
    })

    test('insert before another insert shifts it right', () => {
      const e = new OTEngine('hello')
      e.applyOp({ type: 'insert', position: 0, text: '>>>', revision: 0, userId: 'a' }, 0)
      const t = e.applyOp({ type: 'insert', position: 2, text: 'Z', revision: 0, userId: 'b' }, 0)
      expect(t.position).toBe(5)
    })
  })

  // ── Transform: delete vs insert ────────────────────────────────────
  describe('transform – delete vs insert', () => {
    test('delete after insert shifts right', () => {
      const e = new OTEngine('abcde')
      // Server: insert 'XX' at 0 → 'XXabcde'
      e.applyOp({ type: 'insert', position: 0, text: 'XX', revision: 0, userId: 'a' }, 0)
      expect(e.content).toBe('XXabcde')
      // Client concurrent: delete position 2 length 2 in original 'abcde' = chars 'cd'
      // Transform: position shifts right by 2 (XX length) → deletes pos 4,5 in 'XXabcde' = 'cd'
      const t = e.applyOp({ type: 'delete', position: 2, length: 2, revision: 0, userId: 'b' }, 0)
      expect(t.position).toBe(4)
      expect(e.content).toBe('XXabe') // 'XXab[cd]e' → 'cd' deleted → 'XXabe'
    })

    test('delete before insert unaffected', () => {
      const e = new OTEngine('abcde')
      // Server: insert 'Z' at 4 → 'abcdZe'
      e.applyOp({ type: 'insert', position: 4, text: 'Z', revision: 0, userId: 'a' }, 0)
      expect(e.content).toBe('abcdZe')
      // Client concurrent delete at 0 length 2 ('ab') — before insert point, unshifted
      const t = e.applyOp({ type: 'delete', position: 0, length: 2, revision: 0, userId: 'b' }, 0)
      expect(t.position).toBe(0)
      expect(e.content).toBe('cdZe')
    })
  })

  // ── Transform: delete vs delete ────────────────────────────────────
  describe('transform – delete vs delete', () => {
    test('non-overlapping deletes both apply', () => {
      const e = new OTEngine('abcde')
      e.applyOp({ type: 'delete', position: 0, length: 1, revision: 0, userId: 'a' }, 0)
      const t = e.applyOp({ type: 'delete', position: 4, length: 1, revision: 0, userId: 'b' }, 0)
      expect(e.content).toBe('bcd')
    })

    test('overlapping delete is shrunk', () => {
      const e = new OTEngine('abcde')
      // Server deletes 'bcd' (positions 1-3)
      e.applyOp({ type: 'delete', position: 1, length: 3, revision: 0, userId: 'a' }, 0)
      // Client also tries to delete 'bc' (positions 1-2) — already deleted
      const t = e.applyOp({ type: 'delete', position: 1, length: 2, revision: 0, userId: 'b' }, 0)
      // t should be null (completely consumed) or result in no further change
      expect(e.content).toBe('ae') // only server op took effect
    })

    test('client delete shifted left when server delete precedes it', () => {
      const e = new OTEngine('abcde')
      // Server: delete 'ab' (pos 0, len 2) → 'cde'
      e.applyOp({ type: 'delete', position: 0, length: 2, revision: 0, userId: 'a' }, 0)
      expect(e.content).toBe('cde')
      // Client concurrent: delete position 3 length 1 ('d' in original)
      // After transform against server delete: position shifts left by 2 → position 1
      const t = e.applyOp({ type: 'delete', position: 3, length: 1, revision: 0, userId: 'b' }, 0)
      expect(t.position).toBe(1)
      // 'd' deleted from 'cde' → 'ce'
      expect(e.content).toBe('ce')
    })
  })

  // ── Snapshot ────────────────────────────────────────────────────────
  describe('snapshot', () => {
    test('getSnapshot returns content and revision', () => {
      const e = new OTEngine('init', 5)
      const snap = e.getSnapshot()
      expect(snap.content).toBe('init')
      expect(snap.revision).toBe(5)
    })

    test('snapshot updates after ops', () => {
      const e = new OTEngine('foo')
      e.applyOp({ type: 'insert', position: 3, text: 'bar', revision: 0, userId: 'a' }, 0)
      expect(e.getSnapshot().content).toBe('foobar')
      expect(e.getSnapshot().revision).toBe(1)
    })
  })

  // ── History management ──────────────────────────────────────────────
  describe('history management', () => {
    test('history does not exceed 1000 entries', () => {
      const e = new OTEngine()
      for (let i = 0; i < 1100; i++) {
        e.applyOp({ type: 'insert', position: 0, text: 'a', revision: i, userId: 'a' }, i)
      }
      expect(e.history.length).toBeLessThanOrEqual(1000)
    })
  })

  // ── Multi-user simulation ────────────────────────────────────────────
  describe('multi-user convergence simulation', () => {
    test('two users typing simultaneously converge to same content', () => {
      const serverEngine = new OTEngine('hello')

      // User A inserts ' world' at end (revision 0)
      const opA = { type: 'insert', position: 5, text: ' world', revision: 0, userId: 'userA' }
      // User B inserts '!' at end (revision 0, concurrent with A)
      const opB = { type: 'insert', position: 5, text: '!', revision: 0, userId: 'userB' }

      const tA = serverEngine.applyOp(opA, 0)
      expect(serverEngine.content).toBe('hello world')

      const tB = serverEngine.applyOp(opB, 0)
      // B's '!' should be placed after ' world' since A had lower userId and came first
      expect(serverEngine.content).toContain('hello')
      expect(serverEngine.content).toContain('world')
      expect(serverEngine.content).toContain('!')
      expect(serverEngine.revision).toBe(2)
    })

    test('3-user concurrent edits all converge', () => {
      const e = new OTEngine('abc')
      const users = ['u1', 'u2', 'u3']
      const ops = [
        { type: 'insert', position: 0, text: 'X', revision: 0, userId: 'u1' },
        { type: 'insert', position: 1, text: 'Y', revision: 0, userId: 'u2' },
        { type: 'insert', position: 2, text: 'Z', revision: 0, userId: 'u3' },
      ]
      ops.forEach(op => e.applyOp(op, 0))
      // All chars should be present
      expect(e.content).toContain('X')
      expect(e.content).toContain('Y')
      expect(e.content).toContain('Z')
      expect(e.content).toContain('a')
      expect(e.revision).toBe(3)
    })
  })
})
