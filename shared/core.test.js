import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

const require = createRequire(import.meta.url)
const Z = require('../shared/core.js')

describe('authorization', () => {
  const admin = { userId: 'U1', role: 'admin', active: true, tripIds: [], allTripIds: ['kerala', 'mumbai'] }
  const coordinator = { userId: 'U2', role: 'coordinator', active: true, tripIds: ['kerala'] }
  const inactive = { userId: 'U3', role: 'admin', active: false, tripIds: [] }

  it('admin can access any trip', () => {
    expect(Z.authorize(admin, 'expenses.create', 'kashmir').ok).toBe(true)
    expect(Z.authorize(admin, 'trips.updateBudget', 'mumbai').ok).toBe(true)
    expect(Z.authorize(admin, 'users.create', null).ok).toBe(true)
  })

  it('coordinator can only access assigned trip', () => {
    expect(Z.authorize(coordinator, 'expenses.create', 'kerala').ok).toBe(true)
    expect(Z.authorize(coordinator, 'expenses.create', 'mumbai').ok).toBe(false)
    expect(Z.authorize(coordinator, 'expenses.create', null).ok).toBe(false)
  })

  it('coordinator cannot perform admin-only actions', () => {
    expect(Z.authorize(coordinator, 'expenses.update', 'kerala').ok).toBe(false)
    expect(Z.authorize(coordinator, 'users.create', null).ok).toBe(false)
    expect(Z.authorize(coordinator, 'trips.summary', null).ok).toBe(false)
  })

  it('inactive users are rejected', () => {
    expect(Z.authorize(inactive, 'expenses.create', 'kerala').ok).toBe(false)
    expect(Z.canAccessTrip(inactive, 'kerala')).toBe(false)
  })

  it('unknown actions are rejected', () => {
    expect(Z.authorize(admin, 'not.a.real.action', 'kerala').ok).toBe(false)
  })

  it('scopedTripIds blocks coordinators from other trips', () => {
    expect(Z.scopedTripIds(coordinator, ['mumbai']).ok).toBe(false)
    const own = Z.scopedTripIds(coordinator, ['kerala'])
    expect(own.ok).toBe(true)
    expect(own.tripIds).toEqual(['kerala'])
    const all = Z.scopedTripIds(admin, null)
    expect(all.tripIds).toEqual(['kerala', 'mumbai'])
  })
})

describe('expense validation', () => {
  const ctx = { categories: Z.DEFAULT_CATEGORIES, todayYmd: '2026-10-21', tripId: 'kerala' }

  it('accepts a valid expense', () => {
    const r = Z.validateExpense(
      { reason: 'Lunch at wayside hotel', amount: '450', category: 'Food and refreshments', expenseDate: '2026-10-21', notes: '' },
      ctx,
    )
    expect(r.ok).toBe(true)
    expect(r.value.amount).toBe(450)
  })

  it('parses formatted INR amounts', () => {
    const r = Z.validateExpense(
      { reason: 'Diesel', amount: '₹1,250.50', category: 'Fuel', expenseDate: '2026-10-20' },
      ctx,
    )
    expect(r.ok).toBe(true)
    expect(r.value.amount).toBe(1250.5)
  })

  it('rejects missing reason, amount and category', () => {
    const r = Z.validateExpense({ expenseDate: '2026-10-21' }, ctx)
    expect(r.ok).toBe(false)
    expect(r.errors.reason).toBeTruthy()
    expect(r.errors.amount).toBeTruthy()
    expect(r.errors.category).toBeTruthy()
  })

  it('rejects zero, negative and oversized amounts', () => {
    expect(Z.validateExpense({ reason: 'x', amount: 0, category: 'Other', expenseDate: '2026-10-21' }, ctx).ok).toBe(false)
    expect(Z.validateExpense({ reason: 'x', amount: -5, category: 'Other', expenseDate: '2026-10-21' }, ctx).ok).toBe(false)
    expect(Z.validateExpense({ reason: 'x', amount: 99999999, category: 'Other', expenseDate: '2026-10-21' }, ctx).ok).toBe(false)
  })

  it('rejects future and malformed dates but allows past dates', () => {
    expect(Z.validateExpense({ reason: 'x', amount: 10, category: 'Other', expenseDate: '2026-10-22' }, ctx).errors.expenseDate).toBeTruthy()
    expect(Z.validateExpense({ reason: 'x', amount: 10, category: 'Other', expenseDate: '21-10-2026' }, ctx).errors.expenseDate).toBeTruthy()
    expect(Z.validateExpense({ reason: 'x', amount: 10, category: 'Other', expenseDate: '2026-02-30' }, ctx).errors.expenseDate).toBeTruthy()
    expect(Z.validateExpense({ reason: 'x', amount: 10, category: 'Other', expenseDate: '2026-10-01' }, ctx).ok).toBe(true)
  })

  it('rejects unknown categories', () => {
    expect(Z.validateExpense({ reason: 'x', amount: 10, category: 'Helicopter', expenseDate: '2026-10-21' }, ctx).errors.category).toBeTruthy()
  })

  it('rejects a trip id that does not match the assignment context', () => {
    expect(
      Z.validateExpense({ reason: 'x', amount: 10, category: 'Other', expenseDate: '2026-10-21', tripId: 'mumbai' }, ctx).errors.tripId,
    ).toBeTruthy()
  })
})

describe('duplicate protection', () => {
  it('finds an existing expense by client request id', () => {
    const rows = [{ expenseId: 'E1', clientRequestId: 'req-abc-123', coordinatorId: 'U2' }]
    expect(Z.findDuplicateExpense(rows, 'req-abc-123', 'U2')).toBeTruthy()
    expect(Z.findDuplicateExpense(rows, 'req-abc-123', 'U9')).toBe(null)
    expect(Z.findDuplicateExpense(rows, null, 'U2')).toBe(null)
  })
})

describe('budget calculations', () => {
  it('computes remaining and usage percent', () => {
    const s = Z.computeBudgetStats(10000, 2500)
    expect(s.remaining).toBe(7500)
    expect(s.usedPercent).toBe(25)
    expect(s.level).toBe('ok')
  })

  it('flags warning, high and exceeded levels from real totals', () => {
    expect(Z.computeBudgetStats(1000, 750).level).toBe('warning')
    expect(Z.computeBudgetStats(1000, 900).level).toBe('high')
    expect(Z.computeBudgetStats(1000, 1000).level).toBe('exceeded')
    expect(Z.computeBudgetStats(1000, 1200).level).toBe('exceeded')
    expect(Z.computeBudgetStats(1000, 1200).remaining).toBe(-200)
  })

  it('handles unset or zero budgets without division errors', () => {
    const s = Z.computeBudgetStats(0, 500)
    expect(s.hasBudget).toBe(false)
    expect(s.remaining).toBe(null)
    expect(s.usedPercent).toBe(null)
    expect(s.level).toBe('unknown')
    expect(() => Z.computeBudgetStats(null, 100)).not.toThrow()
  })

  it('excludes void expenses from totals and counts', () => {
    const rows = [
      { amount: 100, status: 'active' },
      { amount: 200, status: 'void' },
      { amount: 50, status: 'active' },
    ]
    expect(Z.sumActiveExpenses(rows)).toBe(150)
    expect(Z.countActiveExpenses(rows)).toBe(2)
    expect(Z.expensesOnDate(rows, '2026-10-21')).toHaveLength(0)
  })
})

describe('report aggregation', () => {
  const rows = [
    { expenseId: 'E1', tripId: 'kerala', category: 'Fuel', coordinatorId: 'U-Ali', coordinatorName: 'Ali', amount: 100, expenseDate: '2026-10-01', status: 'active', submittedAt: '2026-10-01T10:00:00Z' },
    { expenseId: 'E2', tripId: 'kerala', category: 'Food and refreshments', coordinatorId: 'U-Ali', coordinatorName: 'Ali', amount: 250, expenseDate: '2026-10-02', status: 'active', submittedAt: '2026-10-02T10:00:00Z' },
    { expenseId: 'E3', tripId: 'kerala', category: 'Fuel', coordinatorId: 'U-Sam', coordinatorName: 'Sam', amount: 75, expenseDate: '2026-10-02', status: 'void', submittedAt: '2026-10-02T11:00:00Z' },
  ]

  it('aggregates totals, categories, coordinators and days', () => {
    const report = Z.buildReport(rows, {})
    expect(report.totals.total).toBe(350)
    expect(report.totals.count).toBe(2)
    expect(report.totals.voidCount).toBe(1)
    expect(report.byCategory[0].key).toBe('Food and refreshments')
    expect(report.byDay).toHaveLength(2)
    expect(report.byDay[1].total).toBe(250)
  })

  it('filters expenses by date range and coordinator', () => {
    const f = Z.filterExpenses(rows, { fromYmd: '2026-10-02', coordinatorIds: ['U-Ali'], statuses: ['active'] })
    expect(f).toHaveLength(1)
    expect(f[0].expenseId).toBe('E2')
  })

  it('filters by search text', () => {
    expect(Z.filterExpenses(rows, { search: 'ali' })).toHaveLength(2)
    expect(Z.filterExpenses(rows, { search: 'nothing-matches' })).toHaveLength(0)
  })
})

describe('arrival timing', () => {
  const plan = Date.parse('2026-10-21T10:00:00+05:30')

  it('marks on time within tolerance', () => {
    const r = Z.computeArrival(plan, plan + 5 * 60000, 10)
    expect(r.status).toBe('on_time')
    expect(r.delayMinutes).toBe(5)
  })

  it('marks late beyond tolerance with delay minutes', () => {
    const r = Z.computeArrival(plan, plan + 95 * 60000, 10)
    expect(r.status).toBe('late')
    expect(r.delayMinutes).toBe(95)
    expect(Z.formatDuration(95)).toBe('1h 35m')
  })

  it('marks early beyond tolerance', () => {
    const r = Z.computeArrival(plan, plan - 30 * 60000, 10)
    expect(r.status).toBe('early')
    expect(r.earlyMinutes).toBe(30)
  })

  it('handles overnight plans across dates via ISO parsing', () => {
    const overnight = Z.parseSheetDateTime('2026-10-22 01:30')
    expect(overnight).toBeTruthy()
    const r = Z.computeArrival(overnight, overnight + 20 * 60000, 10)
    expect(r.status).toBe('late')
    expect(r.delayMinutes).toBe(20)
  })

  it('defaults tolerance to 10 minutes', () => {
    expect(Z.computeArrival(plan, plan + 8 * 60000, undefined).status).toBe('on_time')
    expect(Z.computeArrival(plan, plan + 12 * 60000, undefined).status).toBe('late')
  })
})

describe('user validation and audit helpers', () => {
  it('requires a trip for coordinators', () => {
    expect(Z.validateUser({ name: 'Ali', email: 'ali@example.com', role: 'coordinator', tripIds: [] }, {}).ok).toBe(false)
    expect(Z.validateUser({ name: 'Ali', email: 'ali@example.com', role: 'coordinator', tripIds: ['kerala'] }, { knownTrips: ['kerala'] }).ok).toBe(true)
  })

  it('normalizes emails and drops trips for admins', () => {
    const r = Z.validateUser({ name: 'Admin ', email: ' Admin@Example.COM ', role: 'admin', tripIds: ['kerala'] }, {})
    expect(r.ok).toBe(true)
    expect(r.value.email).toBe('admin@example.com')
    expect(r.value.tripIds).toEqual([])
  })

  it('describes expense changes for the audit log', () => {
    const before = { reason: 'Tea', amount: 40, category: 'Food and refreshments', expenseDate: '2026-10-21', notes: '' }
    const after = { reason: 'Tea', amount: 60, category: 'Food and refreshments', expenseDate: '2026-10-21', notes: '' }
    expect(Z.describeExpenseChanges(before, after)).toContain('amount: 40 -> 60')
  })
})

describe('date helpers', () => {
  it('formats dates in Asia/Kolkata', () => {
    const d = new Date('2026-10-21T20:00:00Z') // 2026-10-22 01:30 IST
    expect(Z.ymdInTz(d)).toBe('2026-10-22')
  })
})

describe('password hashing (PBKDF2-HMAC-SHA256)', () => {
  const toBuf = (bytes) => Buffer.from(bytes)

  it('sha256 matches Node crypto', () => {
    const msg = Z.utf8BytesForTest ? Z.utf8BytesForTest('abc') : Buffer.from('abc')
    const mine = toBuf(Z.sha256Bytes([...msg]))
    const ref = createHash('sha256').update('abc').digest()
    expect(mine.equals(ref)).toBe(true)
  })

  it('sha256 handles multi-block and empty inputs', () => {
    for (const input of ['', 'a', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(1000)]) {
      const mine = toBuf(Z.sha256Bytes([...Buffer.from(input)]))
      const ref = createHash('sha256').update(input).digest()
      expect(mine.equals(ref)).toBe(true)
    }
  })

  it('HMAC-SHA256 matches Node crypto', () => {
    const key = [...Buffer.from('secret-key')]
    const msg = [...Buffer.from('some message bytes')]
    const mine = toBuf(Z.hmacSha256Bytes(key, msg))
    const ref = createHash('sha256') // build HMAC via node for reference
    const nodeHmac = require('node:crypto').createHmac('sha256', 'secret-key').update('some message bytes').digest()
    expect(mine.equals(nodeHmac)).toBe(true)
    expect(ref).toBeTruthy()
  })

  it('PBKDF2 output matches Node crypto.pbkdf2Sync', () => {
    const password = 'Tr!pC0rd2026'
    const salt = [...randomBytes(16)]
    const iterations = 1200 // low count for test speed; correctness is count-independent
    const mine = toBuf(Z.pbkdf2Sha256(password, salt, iterations, 32))
    const ref = pbkdf2Sync(password, Buffer.from(salt), iterations, 32, 'sha256')
    expect(mine.equals(ref)).toBe(true)
  })

  it('PBKDF2 supports unicode passwords', () => {
    const password = 'வழியாறு2026'
    const salt = [...randomBytes(8)]
    const mine = toBuf(Z.pbkdf2Sha256(password, salt, 500, 32))
    const ref = pbkdf2Sync(password, Buffer.from(salt), 500, 32, 'sha256')
    expect(mine.equals(ref)).toBe(true)
  })

  it('base64 round-trips byte arrays', () => {
    const bytes = [...randomBytes(64)]
    expect([...Buffer.from(Z.bytesToBase64(bytes), 'base64')]).toEqual(bytes)
  })

  it('hashPassword/verifyPassword round-trip and reject wrong passwords', () => {
    const stored = Z.hashPassword('Admin@1234', { iterations: 2000 })
    expect(stored.startsWith('pbkdf2-sha256$2000$')).toBe(true)
    expect(Z.verifyPassword('Admin@1234', stored)).toBe(true)
    expect(Z.verifyPassword('admin@1234', stored)).toBe(false)
    expect(Z.verifyPassword('', stored)).toBe(false)
    expect(Z.verifyPassword('Admin@1234', 'garbage')).toBe(false)
    expect(Z.verifyPassword('Admin@1234', 'pbkdf2-sha256$999$xx$yy')).toBe(false)
  })

  it('two hashes of the same password differ (random salt)', () => {
    const a = Z.hashPassword('SamePass1', { iterations: 2000 })
    const b = Z.hashPassword('SamePass1', { iterations: 2000 })
    expect(a).not.toBe(b)
    expect(Z.verifyPassword('SamePass1', a)).toBe(true)
    expect(Z.verifyPassword('SamePass1', b)).toBe(true)
  })

  it('password policy accepts anything non-empty (even numbers only)', () => {
    expect(Z.validatePassword('')).toBeTruthy()
    expect(Z.validatePassword(null)).toBeTruthy()
    expect(Z.validatePassword('1234567890')).toBe(null)
    expect(Z.validatePassword('allletters')).toBe(null)
    expect(Z.validatePassword('abc')).toBe(null)
    expect(Z.validatePassword('Trip2026')).toBe(null)
  })
})
