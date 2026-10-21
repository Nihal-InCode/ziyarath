/**
 * Ziyarah shared business rules.
 * Runs in Google Apps Script (.gs include, no modules) and in Node (vitest).
 * Pure logic only - no I/O, no GAS services.
 */
var Ziyarah = (function () {
  'use strict'

  var ROLE_ADMIN = 'admin'
  var ROLE_COORDINATOR = 'coordinator'
  var TZ = 'Asia/Kolkata'
  var MAX_AMOUNT = 10000000
  var DEFAULT_CATEGORIES = [
    'Food and refreshments',
    'Accommodation',
    'Transportation',
    'Fuel',
    'Tickets and entry fees',
    'Shopping and supplies',
    'Medical and emergency',
    'Other',
  ]
  var DEFAULT_TRIPS = [
    { tripId: 'kerala', name: 'Kerala Ziyarath' },
    { tripId: 'tamilnadu', name: 'Tamil Nadu Ziyarath' },
    { tripId: 'mumbai', name: 'Mumbai Ziyarath' },
    { tripId: 'kashmir', name: 'Kashmir Ziyarath' },
  ]

  // ---------------------------------------------------------------- permissions
  var PERMISSIONS = {
    'auth.login': { auth: false },
    'auth.session': { auth: true },
    'auth.logout': { auth: true },
    'meta.bootstrap': { auth: true },
    'expenses.create': { auth: true, tripScope: 'trip' },
    'expenses.list': { auth: true, tripScope: 'trip', list: true },
    'expenses.get': { auth: true, tripScope: 'trip' },
    'expenses.update': { auth: true, tripScope: 'trip', adminOnly: true },
    'expenses.void': { auth: true, tripScope: 'trip', adminOnly: true },
    'expenses.restore': { auth: true, tripScope: 'trip', adminOnly: true },
    'trips.list': { auth: true, list: true },
    'trips.summary': { auth: true, adminOnly: true },
    'trips.get': { auth: true, tripScope: 'trip' },
    'trips.dashboard': { auth: true, tripScope: 'trip' },
    'trips.update': { auth: true, adminOnly: true },
    'trips.updateBudget': { auth: true, adminOnly: true },
    'trips.saveItinerary': { auth: true, tripScope: 'trip', adminOnly: true },
    'itinerary.list': { auth: true, tripScope: 'trip' },
    'progress.list': { auth: true, tripScope: 'trip' },
    'progress.arrive': { auth: true, tripScope: 'trip' },
    'ratings.submit': { auth: true, tripScope: 'trip' },
    'ratings.list': { auth: true, tripScope: 'trip' },
    'ratings.summary': { auth: true, tripScope: 'trip' },
    'users.list': { auth: true, adminOnly: true },
    'users.create': { auth: true, adminOnly: true },
    'users.update': { auth: true, adminOnly: true },
    'users.changePassword': { auth: true },
    'reports.summary': { auth: true, tripScope: 'trip', list: true },
    'receipts.upload': { auth: true, tripScope: 'trip' },
    'receipts.get': { auth: true, tripScope: 'trip' },
    'categories.save': { auth: true, adminOnly: true },
    'settings.save': { auth: true, adminOnly: true },
  }

  function actionRule(action) {
    return Object.prototype.hasOwnProperty.call(PERMISSIONS, action) ? PERMISSIONS[action] : null
  }

  function canAccessTrip(user, tripId) {
    if (!user || user.active === false) return false
    if (user.role === ROLE_ADMIN) return true
    if (user.role !== ROLE_COORDINATOR) return false
    if (!tripId) return false
    return (user.tripIds || []).indexOf(tripId) !== -1
  }

  /**
   * authorize(user, action, tripId)
   * For list actions (rule.list) a tripId is not required; the server must still
   * scope the result set with scopedTripIds().
   */
  function authorize(user, action, tripId) {
    var rule = actionRule(action)
    if (!rule) return { ok: false, code: 'unknown_action', message: 'Unknown action.' }
    if (!user || user.active === false) {
      return { ok: false, code: 'unauthenticated', message: 'Sign in required.' }
    }
    if (rule.adminOnly && user.role !== ROLE_ADMIN) {
      return { ok: false, code: 'forbidden', message: 'Administrator access required.' }
    }
    if (rule.tripScope === 'trip' && !rule.list) {
      if (!tripId) return { ok: false, code: 'bad_request', message: 'tripId is required.' }
      if (!canAccessTrip(user, tripId)) {
        return { ok: false, code: 'forbidden', message: 'You are not assigned to this trip.' }
      }
    }
    return { ok: true }
  }

  /**
   * Resolve which trip ids a user may read in a list/report request.
   * requested: array of trip ids from the client (may be null/empty = all allowed).
   * Returns { ok, tripIds } or { ok:false, code, message }.
   */
  function scopedTripIds(user, requested) {
    if (!user || user.active === false) {
      return { ok: false, code: 'unauthenticated', message: 'Sign in required.' }
    }
    var isAdmin = user.role === ROLE_ADMIN
    var allowed = isAdmin ? (user.allTripIds || []) : (user.tripIds || [])
    var req = []
    if (requested && requested.length) {
      for (var i = 0; i < requested.length; i++) {
        var t = String(requested[i] || '').trim()
        if (t && req.indexOf(t) === -1) req.push(t)
      }
    }
    if (isAdmin && !allowed.length) {
      // Admin without an attached trip catalog may read any requested trip
      // (and reads nothing when no trips were requested).
      return { ok: true, tripIds: req }
    }
    if (!req.length) return { ok: true, tripIds: allowed.slice() }
    for (var j = 0; j < req.length; j++) {
      if (allowed.indexOf(req[j]) === -1) {
        return { ok: false, code: 'forbidden', message: 'You are not allowed to view one of those trips.' }
      }
    }
    return { ok: true, tripIds: req }
  }

  // ---------------------------------------------------------------- validation
  function isEmpty(v) {
    return v === undefined || v === null || String(v).trim() === ''
  }

  function sanitizeText(v, maxLen) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen)
    return s
  }

  function parseAmount(raw) {
    if (typeof raw === 'number') return raw
    if (typeof raw === 'string') {
      var s = raw.replace(/[,₹\s]/g, '')
      if (s === '') return NaN
      return Number(s)
    }
    return NaN
  }

  function validateAmount(raw) {
    if (isEmpty(raw)) return 'Amount is required.'
    var n = parseAmount(raw)
    if (!isFinite(n)) return 'Amount must be a number.'
    if (n <= 0) return 'Amount must be greater than zero.'
    if (n > MAX_AMOUNT) return 'Amount looks too large.'
    if (Math.round(n * 100) / 100 !== n) return 'Amount can have at most 2 decimal places.'
    return null
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n
  }

  /** Format a Date into YYYY-MM-DD in Asia/Kolkata. */
  function ymdInTz(date, timeZone) {
    var tz = timeZone || TZ
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    var out = {}
    for (var i = 0; i < parts.length; i++) out[parts[i].type] = parts[i].value
    return out.year + '-' + out.month + '-' + out.day
  }

  /** Validate a YYYY-MM-DD string as a real calendar date. */
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim())
    if (!m) return null
    var y = Number(m[1])
    var mo = Number(m[2])
    var d = Number(m[3])
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    var date = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0))
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
    return date
  }

  function validateExpenseDate(raw, opts) {
    opts = opts || {}
    var s = String(raw == null ? '' : raw).trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 'Expense date must be in YYYY-MM-DD format.'
    if (!parseYmd(s)) return 'Expense date is not a valid date.'
    var today = opts.todayYmd || ymdInTz(new Date())
    if (s > today) return 'Expense date cannot be in the future.'
    if (s < '2020-01-01') return 'Expense date is too far in the past.'
    return null
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

  function validateEmail(raw) {
    var s = String(raw == null ? '' : raw).trim().toLowerCase()
    if (!s) return 'Email is required.'
    if (!EMAIL_RE.test(s)) return 'Enter a valid email address.'
    if (s.length > 254) return 'Email is too long.'
    return null
  }

  /**
   * validateExpense(input, ctx)
   * ctx: { categories: [names], todayYmd: 'YYYY-MM-DD', tripId: 'kerala' }
   */
  function validateExpense(input, ctx) {
    ctx = ctx || {}
    input = input || {}
    var errors = {}

    var reason = sanitizeText(input.reason, 200)
    if (!reason) errors.reason = 'Reason is required.'
    else if (String(input.reason || '').trim().length > 200) errors.reason = 'Reason must be 200 characters or fewer.'

    var amountErr = validateAmount(input.amount)
    if (amountErr) errors.amount = amountErr

    var category = sanitizeText(input.category, 80)
    if (!category) errors.category = 'Category is required.'
    else if (ctx.categories && ctx.categories.length && ctx.categories.indexOf(category) === -1) {
      errors.category = 'Unknown category.'
    }

    var dateErr = validateExpenseDate(input.expenseDate, { todayYmd: ctx.todayYmd })
    if (dateErr) errors.expenseDate = dateErr

    var notes = String(input.notes == null ? '' : input.notes)
    if (notes.length > 1000) errors.notes = 'Notes must be 1000 characters or fewer.'

    if (!isEmpty(input.tripId) && ctx.tripId && String(input.tripId) !== String(ctx.tripId)) {
      errors.tripId = 'Trip does not match your assignment.'
    }

    var clientRequestId = input.clientRequestId == null ? null : String(input.clientRequestId).trim()
    if (clientRequestId && !/^[A-Za-z0-9_-]{8,64}$/.test(clientRequestId)) {
      errors.clientRequestId = 'Invalid request id.'
    }

    var keys = Object.keys(errors)
    if (keys.length) return { ok: false, errors: errors, value: null }
    return {
      ok: true,
      errors: {},
      value: {
        reason: reason,
        amount: Math.round(parseAmount(input.amount) * 100) / 100,
        category: category,
        expenseDate: String(input.expenseDate).trim(),
        notes: notes.replace(/\s+/g, ' ').trim(),
        clientRequestId: clientRequestId,
      },
    }
  }

  function validateUser(input, ctx) {
    ctx = ctx || {}
    var errors = {}
    var name = sanitizeText(input.name, 120)
    if (!name) errors.name = 'Name is required.'
    var emailErr = validateEmail(input.email)
    if (emailErr) errors.email = emailErr
    var role = String(input.role || '').trim()
    if (role !== ROLE_ADMIN && role !== ROLE_COORDINATOR) errors.role = 'Role must be admin or coordinator.'
    var tripIds = []
    if (input.tripIds && input.tripIds.length) {
      for (var i = 0; i < input.tripIds.length; i++) {
        var t = String(input.tripIds[i] || '').trim()
        if (t && tripIds.indexOf(t) === -1) tripIds.push(t)
      }
    }
    if (role === ROLE_COORDINATOR && !tripIds.length) {
      errors.tripIds = 'Assign the coordinator to at least one trip.'
    }
    if (ctx.knownTrips && ctx.knownTrips.length) {
      for (var j = 0; j < tripIds.length; j++) {
        if (ctx.knownTrips.indexOf(tripIds[j]) === -1) errors.tripIds = 'Unknown trip id: ' + tripIds[j]
      }
    }
    var keys = Object.keys(errors)
    if (keys.length) return { ok: false, errors: errors, value: null }
    return {
      ok: true,
      errors: {},
      value: { name: name, email: String(input.email).trim().toLowerCase(), role: role, tripIds: role === ROLE_ADMIN ? [] : tripIds },
    }
  }

  function validateBudget(input) {
    var errors = {}
    if (isEmpty(input.amount)) errors.amount = 'Budget amount is required.'
    else {
      var n = parseAmount(input.amount)
      if (!isFinite(n)) errors.amount = 'Budget must be a number.'
      else if (n < 0) errors.amount = 'Budget cannot be negative.'
      else if (n > MAX_AMOUNT) errors.amount = 'Budget looks too large.'
    }
    var keys = Object.keys(errors)
    if (keys.length) return { ok: false, errors: errors, value: null }
    return { ok: true, errors: {}, value: { amount: Math.round(parseAmount(input.amount) * 100) / 100 } }
  }

  /** 'YYYY-MM-DD HH:mm' text -> epoch ms (parsed as Asia/Kolkata) or null. */
  function parseSheetDateTime(text) {
    var s = String(text == null ? '' : text).replace(/^'/, '').trim()
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s)
    if (!m) return null
    var iso = m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + (m[6] || '00') + '+05:30'
    var ms = Date.parse(iso)
    return isFinite(ms) ? ms : null
  }

  function validateStop(input) {
    var errors = {}
    var locationName = sanitizeText(input.locationName, 120)
    if (!locationName) errors.locationName = 'Location name is required.'
    var sequence = Number(input.sequence)
    if (!isFinite(sequence) || sequence < 1 || Math.floor(sequence) !== sequence) {
      errors.sequence = 'Sequence must be a whole number of 1 or more.'
    }
    var arrivalMs = parseSheetDateTime(input.plannedArrival)
    if (!arrivalMs) errors.plannedArrival = 'Planned arrival must be a valid date and time.'
    var departureMs = input.plannedDeparture ? parseSheetDateTime(input.plannedDeparture) : null
    if (input.plannedDeparture && !departureMs) errors.plannedDeparture = 'Planned departure must be a valid date and time.'
    if (arrivalMs && departureMs && departureMs < arrivalMs) {
      errors.plannedDeparture = 'Departure must be after arrival.'
    }
    var notes = String(input.notes == null ? '' : input.notes)
    if (notes.length > 1000) errors.notes = 'Notes must be 1000 characters or fewer.'
    var keys = Object.keys(errors)
    if (keys.length) return { ok: false, errors: errors, value: null }
    return {
      ok: true,
      errors: {},
      value: {
        stopId: input.stopId ? String(input.stopId).trim() : null,
        sequence: sequence,
        locationName: locationName,
        plannedArrival: String(input.plannedArrival).replace(/^'/, '').trim(),
        plannedDeparture: departureMs ? String(input.plannedDeparture).replace(/^'/, '').trim() : '',
        expectedDuration: sanitizeText(input.expectedDuration, 60),
        notes: notes.trim(),
      },
    }
  }

  function validateRating(input) {
    var errors = {}
    var fields = ['destination', 'accommodation', 'food', 'transport', 'overall']
    var labels = {
      destination: 'Destination',
      accommodation: 'Accommodation',
      food: 'Food',
      transport: 'Transportation',
      overall: 'Overall',
    }
    var value = {}
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i]
      var n = Number(input[f])
      if (!isFinite(n) || Math.floor(n) !== n || n < 1 || n > 5) {
        errors[f] = labels[f] + ' rating must be between 1 and 5.'
      } else {
        value[f] = n
      }
    }
    if (!isEmpty(input.stopId) && !/^[A-Za-z0-9_-]{4,64}$/.test(String(input.stopId).trim())) {
      errors.stopId = 'Invalid stop id.'
    }
    var feedback = String(input.feedback == null ? '' : input.feedback).trim()
    if (feedback.length > 1000) errors.feedback = 'Feedback must be 1000 characters or fewer.'
    var keys = Object.keys(errors)
    if (keys.length) return { ok: false, errors: errors, value: null }
    value.stopId = input.stopId ? String(input.stopId).trim() : ''
    value.feedback = feedback
    return { ok: true, errors: {}, value: value }
  }

  // ---------------------------------------------------------------- budget math
  function budgetLevel(percent) {
    if (percent == null || !isFinite(percent)) return 'unknown'
    if (percent >= 100) return 'exceeded'
    if (percent >= 90) return 'high'
    if (percent >= 75) return 'warning'
    return 'ok'
  }

  function round2(n) {
    return Math.round(n * 100) / 100
  }

  function computeBudgetStats(totalBudget, expenseTotal) {
    var budget = Number(totalBudget)
    var spent = round2(Number(expenseTotal) || 0)
    var hasBudget = isFinite(budget) && budget > 0
    if (!hasBudget) {
      return { hasBudget: false, totalBudget: null, spent: spent, remaining: null, usedPercent: null, level: 'unknown' }
    }
    var usedPercent = round2((spent / budget) * 100)
    return {
      hasBudget: true,
      totalBudget: round2(budget),
      spent: spent,
      remaining: round2(budget - spent),
      usedPercent: usedPercent,
      level: budgetLevel(usedPercent),
    }
  }

  function isCountedExpense(e) {
    return !!e && String(e.status || 'active') !== 'void'
  }

  function sumActiveExpenses(expenses) {
    var total = 0
    for (var i = 0; i < expenses.length; i++) {
      if (!isCountedExpense(expenses[i])) continue
      var n = Number(expenses[i].amount)
      if (isFinite(n)) total += n
    }
    return round2(total)
  }

  function countActiveExpenses(expenses) {
    var c = 0
    for (var i = 0; i < expenses.length; i++) if (isCountedExpense(expenses[i])) c++
    return c
  }

  function expensesOnDate(expenses, ymd) {
    var out = []
    for (var i = 0; i < expenses.length; i++) {
      if (isCountedExpense(expenses[i]) && String(expenses[i].expenseDate) === ymd) out.push(expenses[i])
    }
    return out
  }

  function groupSum(expenses, keyFn) {
    var map = {}
    for (var i = 0; i < expenses.length; i++) {
      if (!isCountedExpense(expenses[i])) continue
      var key = String(keyFn(expenses[i]) || '')
      if (!map[key]) map[key] = { key: key, total: 0, count: 0 }
      var n = Number(expenses[i].amount)
      if (isFinite(n)) map[key].total += n
      map[key].count++
    }
    var out = []
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        map[k].total = round2(map[k].total)
        out.push(map[k])
      }
    }
    out.sort(function (a, b) { return b.total - a.total })
    return out
  }

  function dailyTotals(expenses, fromYmd, toYmd) {
    var map = {}
    for (var i = 0; i < expenses.length; i++) {
      var e = expenses[i]
      if (!isCountedExpense(e)) continue
      var d = String(e.expenseDate)
      if (fromYmd && d < fromYmd) continue
      if (toYmd && d > toYmd) continue
      if (!map[d]) map[d] = { date: d, total: 0, count: 0 }
      var n = Number(e.amount)
      if (isFinite(n)) map[d].total += n
      map[d].count++
    }
    var out = []
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k)) {
        map[k].total = round2(map[k].total)
        out.push(map[k])
      }
    }
    out.sort(function (a, b) { return a.date < b.date ? -1 : 1 })
    return out
  }

  /**
   * filterExpenses(expenses, f)
   * f: { tripIds, coordinatorIds, categories, statuses, fromYmd, toYmd, search }
   * Returns a new array; never mutates.
   */
  function filterExpenses(expenses, f) {
    f = f || {}
    var tripIds = f.tripIds && f.tripIds.length ? f.tripIds.map(String) : null
    var coordinatorIds = f.coordinatorIds && f.coordinatorIds.length ? f.coordinatorIds.map(String) : null
    var categories = f.categories && f.categories.length ? f.categories.map(String) : null
    var statuses = f.statuses && f.statuses.length ? f.statuses.map(String) : null
    var search = f.search ? String(f.search).trim().toLowerCase() : ''
    var out = []
    for (var i = 0; i < expenses.length; i++) {
      var e = expenses[i]
      if (tripIds && tripIds.indexOf(String(e.tripId)) === -1) continue
      if (coordinatorIds && coordinatorIds.indexOf(String(e.coordinatorId)) === -1) continue
      if (categories && categories.indexOf(String(e.category)) === -1) continue
      if (statuses && statuses.indexOf(String(e.status || 'active')) === -1) continue
      if (f.fromYmd && String(e.expenseDate) < f.fromYmd) continue
      if (f.toYmd && String(e.expenseDate) > f.toYmd) continue
      if (search) {
        var hay = (String(e.reason || '') + ' ' + String(e.notes || '') + ' ' + String(e.coordinatorName || '')).toLowerCase()
        if (hay.indexOf(search) === -1) continue
      }
      out.push(e)
    }
    return out
  }

  function sortExpensesByDateDesc(expenses) {
    return expenses.slice().sort(function (a, b) {
      var da = String(a.expenseDate || '')
      var db = String(b.expenseDate || '')
      if (da !== db) return da < db ? 1 : -1
      var sa = String(a.submittedAt || '')
      var sb = String(b.submittedAt || '')
      return sa < sb ? 1 : -1
    })
  }

  /** buildReport(expenses, opts) -> server-side report aggregation. */
  function buildReport(expenses, opts) {
    opts = opts || {}
    var counted = []
    for (var i = 0; i < expenses.length; i++) if (isCountedExpense(expenses[i])) counted.push(expenses[i])
    var byCategory = groupSum(counted, function (e) { return e.category })
    var byCoordinator = groupSum(counted, function (e) { return e.coordinatorName || e.coordinatorId })
    var byTrip = groupSum(counted, function (e) { return e.tripId })
    var byDay = dailyTotals(counted, opts.fromYmd, opts.toYmd)
    var rows = sortExpensesByDateDesc(counted)
    return {
      totals: {
        count: counted.length,
        total: sumActiveExpenses(counted),
        voidCount: expenses.length - counted.length,
      },
      byDay: byDay,
      byCategory: byCategory,
      byCoordinator: byCoordinator,
      byTrip: byTrip,
      rows: rows,
    }
  }

  // ---------------------------------------------------------------- arrivals
  /**
   * computeArrival(plannedAtMs, actualAtMs, toleranceMinutes)
   * -> { ok, status: early|on_time|late, signedMinutes, delayMinutes, earlyMinutes }
   */
  function computeArrival(plannedAtMs, actualAtMs, toleranceMinutes) {
    if (!plannedAtMs || !actualAtMs || !isFinite(plannedAtMs) || !isFinite(actualAtMs)) {
      return { ok: false, status: 'unknown', signedMinutes: 0, delayMinutes: 0, earlyMinutes: 0 }
    }
    var tolerance = Number(toleranceMinutes)
    if (!isFinite(tolerance) || tolerance < 0) tolerance = 10
    var signed = Math.round((actualAtMs - plannedAtMs) / 60000)
    var status
    if (signed > tolerance) status = 'late'
    else if (signed < -tolerance) status = 'early'
    else status = 'on_time'
    return {
      ok: true,
      status: status,
      signedMinutes: signed,
      delayMinutes: signed > 0 ? signed : 0,
      earlyMinutes: signed < 0 ? -signed : 0,
    }
  }

  function formatDuration(minutes) {
    var m = Math.round(Number(minutes) || 0)
    var sign = m < 0 ? '-' : ''
    m = Math.abs(m)
    var h = Math.floor(m / 60)
    var r = m % 60
    if (h && r) return sign + h + 'h ' + r + 'm'
    if (h) return sign + h + 'h'
    return sign + r + 'm'
  }

  // ---------------------------------------------------------------- audit & ids
  function newId(prefix, nowMs, rand) {
    var t = (nowMs || 0).toString(36).toUpperCase()
    var r = rand ? String(rand()) : Math.random().toString(36).slice(2, 8)
    r = r.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    if (r.length < 4) r = (r + 'X' + t).slice(0, 6)
    return prefix + '-' + t + '-' + r
  }

  function buildAudit(user, action, recordType, recordId, tripId, timestampIso, summary) {
    return {
      auditId: newId('AUD', Date.parse(timestampIso) || Date.now(), null),
      userId: user ? user.userId : 'system',
      userName: user ? user.name : 'system',
      action: String(action),
      recordType: String(recordType),
      recordId: String(recordId),
      tripId: tripId ? String(tripId) : '',
      timestamp: timestampIso,
      changeSummary: sanitizeText(summary, 500),
    }
  }

  var EDITABLE_EXPENSE_FIELDS = ['reason', 'amount', 'category', 'expenseDate', 'notes']

  function describeExpenseChanges(before, after) {
    var parts = []
    for (var i = 0; i < EDITABLE_EXPENSE_FIELDS.length; i++) {
      var f = EDITABLE_EXPENSE_FIELDS[i]
      var a = before ? before[f] : null
      var b = after ? after[f] : null
      if (String(a == null ? '' : a) !== String(b == null ? '' : b)) {
        parts.push(f + ': ' + a + ' -> ' + b)
      }
    }
    return parts.length ? parts.join('; ') : 'no field changes'
  }

  function findDuplicateExpense(expenses, clientRequestId, coordinatorId) {
    if (!clientRequestId) return null
    for (var i = 0; i < expenses.length; i++) {
      var e = expenses[i]
      if (String(e.clientRequestId || '') === String(clientRequestId) && String(e.coordinatorId) === String(coordinatorId)) {
        return e
      }
    }
    return null
  }

  // ---------------------------------------------------------------- api envelope
  function ok(data) {
    return { ok: true, data: data }
  }

  function fail(code, message, details) {
    return { ok: false, error: { code: code, message: message, details: details || null } }
  }

  // ---------------------------------------------------------------- passwords (PBKDF2-HMAC-SHA256)
  // Standard PBKDF2 (RFC 8018) over HMAC-SHA256. No custom cryptography.
  var SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]

  function sha256Rrot(x, n) {
    return (x >>> n) | (x << (32 - n))
  }

  /** sha256Bytes(byteArray) -> byteArray (32 bytes) */
  function sha256Bytes(input) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
    var l = input.length
    var withOne = l + 1
    var totalLen = withOne + ((64 - ((withOne + 8) % 64)) % 64) + 8
    var bytes = new Array(totalLen)
    var i
    for (i = 0; i < l; i++) bytes[i] = input[i] & 0xff
    bytes[l] = 0x80
    for (i = l + 1; i < totalLen; i++) bytes[i] = 0
    var bitLenHi = Math.floor(l / 536870912) // floor(l * 8 / 2^32)
    var bitLenLo = (l * 8) >>> 0
    bytes[totalLen - 8] = (bitLenHi >>> 24) & 0xff
    bytes[totalLen - 7] = (bitLenHi >>> 16) & 0xff
    bytes[totalLen - 6] = (bitLenHi >>> 8) & 0xff
    bytes[totalLen - 5] = bitLenHi & 0xff
    bytes[totalLen - 4] = (bitLenLo >>> 24) & 0xff
    bytes[totalLen - 3] = (bitLenLo >>> 16) & 0xff
    bytes[totalLen - 2] = (bitLenLo >>> 8) & 0xff
    bytes[totalLen - 1] = bitLenLo & 0xff

    var w = new Array(64)
    for (var off = 0; off < totalLen; off += 64) {
      var t
      for (t = 0; t < 16; t++) {
        var j = off + t * 4
        w[t] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) | 0
      }
      for (t = 16; t < 64; t++) {
        var w15 = w[t - 15]
        var w2 = w[t - 2]
        var s0 = sha256Rrot(w15, 7) ^ sha256Rrot(w15, 18) ^ (w15 >>> 3)
        var s1 = sha256Rrot(w2, 17) ^ sha256Rrot(w2, 19) ^ (w2 >>> 10)
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
      for (t = 0; t < 64; t++) {
        var S1 = sha256Rrot(e, 6) ^ sha256Rrot(e, 11) ^ sha256Rrot(e, 25)
        var ch = (e & f) ^ (~e & g)
        var temp1 = (h + S1 + ch + SHA256_K[t] + w[t]) | 0
        var S0 = sha256Rrot(a, 2) ^ sha256Rrot(a, 13) ^ sha256Rrot(a, 22)
        var maj = (a & b) ^ (a & c) ^ (b & c)
        var temp2 = (S0 + maj) | 0
        h = g
        g = f
        f = e
        e = (d + temp1) | 0
        d = c
        c = b
        b = a
        a = (temp1 + temp2) | 0
      }
      H[0] = (H[0] + a) | 0
      H[1] = (H[1] + b) | 0
      H[2] = (H[2] + c) | 0
      H[3] = (H[3] + d) | 0
      H[4] = (H[4] + e) | 0
      H[5] = (H[5] + f) | 0
      H[6] = (H[6] + g) | 0
      H[7] = (H[7] + h) | 0
    }
    var out = new Array(32)
    for (var k = 0; k < 8; k++) {
      out[k * 4] = (H[k] >>> 24) & 0xff
      out[k * 4 + 1] = (H[k] >>> 16) & 0xff
      out[k * 4 + 2] = (H[k] >>> 8) & 0xff
      out[k * 4 + 3] = H[k] & 0xff
    }
    return out
  }

  function utf8Bytes(str) {
    var out = []
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i)
      if (c < 0x80) {
        out.push(c)
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i)
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
      }
    }
    return out
  }

  function hmacSha256Bytes(keyBytes, msgBytes) {
    var block = 64
    var k = keyBytes.length > block ? sha256Bytes(keyBytes) : keyBytes.slice()
    var inner = []
    var outer = []
    var i
    for (i = 0; i < block; i++) {
      var b = i < k.length ? k[i] : 0
      inner.push(b ^ 0x36)
      outer.push(b ^ 0x5c)
    }
    var innerHash = sha256Bytes(inner.concat(msgBytes))
    return sha256Bytes(outer.concat(innerHash))
  }

  /** PBKDF2-HMAC-SHA256 -> byteArray of dkLen bytes. */
  function pbkdf2Sha256(password, saltBytes, iterations, dkLen) {
    var pwd = utf8Bytes(String(password))
    var hLen = 32
    var blocks = Math.ceil(dkLen / hLen)
    var out = []
    for (var b = 1; b <= blocks; b++) {
      var blockInput = saltBytes.slice()
      blockInput.push((b >>> 24) & 0xff, (b >>> 16) & 0xff, (b >>> 8) & 0xff, b & 0xff)
      var u = hmacSha256Bytes(pwd, blockInput)
      var t = u.slice()
      for (var i = 1; i < iterations; i++) {
        u = hmacSha256Bytes(pwd, u)
        for (var j = 0; j < t.length; j++) t[j] ^= u[j]
      }
      out = out.concat(t)
    }
    return out.slice(0, dkLen)
  }

  var B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

  function bytesToBase64(bytes) {
    var out = ''
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i]
      var b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
      var b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
      out += B64_ALPHABET.charAt(b0 >> 2)
      out += B64_ALPHABET.charAt(((b0 & 3) << 4) | (b1 >> 4))
      out += i + 1 < bytes.length ? B64_ALPHABET.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '='
      out += i + 2 < bytes.length ? B64_ALPHABET.charAt(b2 & 63) : '='
    }
    return out
  }

  function base64ToBytes(str) {
    var clean = String(str || '').replace(/=+$/, '')
    var out = []
    var buffer = 0
    var bits = 0
    for (var i = 0; i < clean.length; i++) {
      var v = B64_ALPHABET.indexOf(clean.charAt(i))
      if (v < 0) continue
      buffer = (buffer << 6) | v
      bits += 6
      if (bits >= 8) {
        bits -= 8
        out.push((buffer >> bits) & 0xff)
      }
    }
    return out
  }

  var DEFAULT_PBKDF2_ITERATIONS = 120000
  var MIN_PASSWORD_LENGTH = 1

  /** Policy: any non-empty password (letters, numbers, symbols — anything). */
  function validatePassword(pw) {
    var s = String(pw == null ? '' : pw)
    if (s.length < MIN_PASSWORD_LENGTH) return 'Password is required.'
    if (s.length > 200) return 'Password is too long.'
    return null
  }

  /** Returns 'pbkdf2-sha256$<iterations>$<saltB64>$<hashB64>'. */
  function hashPassword(password, opts) {
    opts = opts || {}
    var iterations = opts.iterations || DEFAULT_PBKDF2_ITERATIONS
    var salt = opts.salt || null
    if (!salt) {
      salt = []
      for (var i = 0; i < 16; i++) salt.push(Math.floor(Math.random() * 256))
    }
    var dk = pbkdf2Sha256(password, salt, iterations, 32)
    return 'pbkdf2-sha256$' + iterations + '$' + bytesToBase64(salt) + '$' + bytesToBase64(dk)
  }

  function verifyPassword(password, stored) {
    var parts = String(stored == null ? '' : stored).split('$')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false
    var iterations = parseInt(parts[1], 10)
    if (!isFinite(iterations) || iterations < 1000 || iterations > 2000000) return false
    var salt
    var expected
    try {
      salt = base64ToBytes(parts[2])
      expected = base64ToBytes(parts[3])
    } catch (e) {
      return false
    }
    if (!expected.length) return false
    var actual = pbkdf2Sha256(password, salt, iterations, expected.length)
    var diff = 0
    for (var i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i]
    return diff === 0
  }

  /** Dummy verification used when an email is unknown (limits user enumeration). */
  var DUMMY_HASH = null
  function dummyVerify(password) {
    if (!DUMMY_HASH) DUMMY_HASH = hashPassword('ziyarah-dummy-password-1', { iterations: 20000 })
    verifyPassword(password, DUMMY_HASH)
    return false
  }

  return {
    ROLE_ADMIN: ROLE_ADMIN,
    ROLE_COORDINATOR: ROLE_COORDINATOR,
    TZ: TZ,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    DEFAULT_TRIPS: DEFAULT_TRIPS,
    PERMISSIONS: PERMISSIONS,
    actionRule: actionRule,
    canAccessTrip: canAccessTrip,
    authorize: authorize,
    scopedTripIds: scopedTripIds,
    isEmpty: isEmpty,
    sanitizeText: sanitizeText,
    parseAmount: parseAmount,
    validateAmount: validateAmount,
    ymdInTz: ymdInTz,
    parseYmd: parseYmd,
    validateExpenseDate: validateExpenseDate,
    validateEmail: validateEmail,
    validateExpense: validateExpense,
    validateUser: validateUser,
    validateBudget: validateBudget,
    parseSheetDateTime: parseSheetDateTime,
    validateStop: validateStop,
    validateRating: validateRating,
    budgetLevel: budgetLevel,
    computeBudgetStats: computeBudgetStats,
    isCountedExpense: isCountedExpense,
    sumActiveExpenses: sumActiveExpenses,
    countActiveExpenses: countActiveExpenses,
    expensesOnDate: expensesOnDate,
    groupSum: groupSum,
    dailyTotals: dailyTotals,
    filterExpenses: filterExpenses,
    sortExpensesByDateDesc: sortExpensesByDateDesc,
    buildReport: buildReport,
    computeArrival: computeArrival,
    formatDuration: formatDuration,
    newId: newId,
    buildAudit: buildAudit,
    describeExpenseChanges: describeExpenseChanges,
    findDuplicateExpense: findDuplicateExpense,
    ok: ok,
    fail: fail,
    sha256Bytes: sha256Bytes,
    hmacSha256Bytes: hmacSha256Bytes,
    pbkdf2Sha256: pbkdf2Sha256,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    DEFAULT_PBKDF2_ITERATIONS: DEFAULT_PBKDF2_ITERATIONS,
    validatePassword: validatePassword,
    hashPassword: hashPassword,
    verifyPassword: verifyPassword,
    dummyVerify: dummyVerify,
  }
})()

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = Ziyarah
}
