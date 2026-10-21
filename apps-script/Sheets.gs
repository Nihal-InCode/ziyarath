/**
 * Sheets.gs - safe Google Sheets data access layer.
 * Header-driven row objects; never uses row numbers as record ids.
 */

function ssMaster_() {
  return SpreadsheetApp.openById(masterId_())
}

function masterTab_(name) {
  var ss = ssMaster_()
  var sh = ss.getSheetByName(name)
  if (!sh) {
    throw new Error('Master spreadsheet is missing the "' + name + '" tab. Run setupAll() from the Apps Script editor.')
  }
  return sh
}

/**
 * Row object map: header name -> snake key.
 * Kept explicit so column order can change without breaking the app.
 */
var KEY_MAP = {}
KEY_MAP[TAB.EXPENSES] = {
  'Expense ID': 'expenseId', 'Trip ID': 'tripId', 'Expense Date': 'expenseDate', 'Submitted At': 'submittedAt',
  'Coordinator ID': 'coordinatorId', 'Coordinator Name': 'coordinatorName', Reason: 'reason', Category: 'category',
  Amount: 'amount', Notes: 'notes', 'Receipt Reference': 'receiptReference', Status: 'status',
  'Created At': 'createdAt', 'Updated At': 'updatedAt', 'Last Edited By': 'lastEditedBy', 'Client Request ID': 'clientRequestId',
}
KEY_MAP[TAB.TRIP_PLAN] = {
  'Stop ID': 'stopId', 'Trip ID': 'tripId', 'Sequence Number': 'sequence', 'Location Name': 'locationName',
  'Planned Arrival': 'plannedArrival', 'Expected Departure': 'plannedDeparture', 'Expected Duration': 'expectedDuration',
  Notes: 'notes', Status: 'status',
}
KEY_MAP[TAB.PROGRESS] = {
  'Progress ID': 'progressId', 'Trip ID': 'tripId', 'Stop ID': 'stopId', 'Coordinator ID': 'coordinatorId',
  'Actual Arrival': 'actualArrival', 'Actual Departure': 'actualDeparture', 'Delay in Minutes': 'delayMinutes',
  Status: 'status', 'Delay Reason': 'delayReason', Notes: 'notes', 'Submitted At': 'submittedAt',
}
KEY_MAP[TAB.RATINGS] = {
  'Rating ID': 'ratingId', 'Trip ID': 'tripId', 'Stop ID': 'stopId', 'Reviewer ID': 'reviewerId',
  'Destination Rating': 'destination', 'Accommodation Rating': 'accommodation', 'Food Rating': 'food',
  'Transport Rating': 'transport', 'Overall Rating': 'overall', Feedback: 'feedback', 'Submitted At': 'submittedAt',
}
KEY_MAP[TAB.AUDIT] = {
  'Audit ID': 'auditId', 'User ID': 'userId', 'User Name': 'userName', Action: 'action', 'Record Type': 'recordType',
  'Record ID': 'recordId', 'Trip ID': 'tripId', Timestamp: 'timestamp', 'Change Summary': 'changeSummary',
}
KEY_MAP[TAB.TRIPS] = {
  'Trip ID': 'tripId', Name: 'name', 'Spreadsheet ID': 'spreadsheetId', Active: 'active', 'Start Date': 'startDate',
  'End Date': 'endDate', 'Sort Order': 'sortOrder', 'Created At': 'createdAt', 'Updated At': 'updatedAt',
}
KEY_MAP[TAB.USERS] = {
  'User ID': 'userId', Name: 'name', Email: 'email', Role: 'role', 'Trip IDs': 'tripIds', Active: 'active',
  'Session Version': 'sessionVersion', 'Created At': 'createdAt', 'Updated At': 'updatedAt', 'Created By': 'createdBy',
  'Password Hash': 'passwordHash',
}
KEY_MAP[TAB.BUDGETS] = {
  'Budget ID': 'budgetId', 'Trip ID': 'tripId', Scope: 'scope', Category: 'category', Amount: 'amount',
  'Updated At': 'updatedAt', 'Updated By': 'updatedBy',
}
KEY_MAP[TAB.CATEGORIES] = {
  'Category ID': 'categoryId', Name: 'name', Active: 'active', 'Sort Order': 'sortOrder', 'Created At': 'createdAt',
}
KEY_MAP[TAB.SETTINGS] = { Key: 'key', Value: 'value', 'Updated At': 'updatedAt', 'Updated By': 'updatedBy' }

function normalizeRow_(tabName, raw, headers, rowNumber) {
  var map = KEY_MAP[tabName] || {}
  var obj = { _row: rowNumber }
  for (var i = 0; i < headers.length; i++) {
    var key = map[headers[i]]
    if (!key) continue
    var v = raw[i]
    if (v instanceof Date) {
      obj[key] = v
    } else if (v === null || v === undefined) {
      obj[key] = ''
    } else {
      obj[key] = v
    }
  }
  return obj
}

/**
 * Read a whole tab as row objects (plus _row numbers for safe updates).
 * Date-like text fields are normalized to string forms.
 */
function readTable_(sheet, tabName) {
  var lastRow = sheet.getLastRow()
  var lastCol = sheet.getLastColumn()
  if (lastRow < 1 || lastCol < 1) return { headers: [], rows: [] }
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues()
  var headers = values[0].map(function (h) { return String(h).trim() })
  var rows = []
  for (var r = 1; r < values.length; r++) {
    var raw = values[r]
    var allEmpty = true
    for (var c = 0; c < raw.length; c++) {
      if (String(raw[c]).trim() !== '') { allEmpty = false; break }
    }
    if (allEmpty) continue
    rows.push(normalizeRow_(tabName, raw, headers, r + 1))
  }
  return { headers: headers, rows: rows }
}

/** Find a tab's header index (1-based) for a given header name. */
function headerIndex_(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === name) return i + 1
  }
  return -1
}

/**
 * Build a full-width value array for a row object in header order.
 * Handles Date vs number vs text (date-like strings are quote-prefixed).
 */
function rowToValues_(headers, obj, tabName) {
  var map = KEY_MAP[tabName] || {}
  var dateTextKeys = {
    expenseDate: 1, submittedAt: 1, createdAt: 1, updatedAt: 1, plannedArrival: 1, plannedDeparture: 1,
    actualArrival: 1, actualDeparture: 1, timestamp: 1, startDate: 1, endDate: 1, createdAt2: 1,
  }
  var out = []
  for (var i = 0; i < headers.length; i++) {
    var key = map[headers[i]]
    var v = key ? obj[key] : ''
    if (v === null || v === undefined) v = ''
    if (v instanceof Date) {
      out.push(Utilities.formatDate(v, APP_TZ, 'yyyy-MM-dd HH:mm'))
    } else if (typeof v === 'number') {
      out.push(v)
    } else if (Array.isArray(v)) {
      out.push(v.join(', '))
    } else {
      var s = String(v)
      if (key && dateTextKeys[key] && /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?(Z)?$/.test(s)) {
        out.push(text_(s))
      } else {
        out.push(s)
      }
    }
  }
  return out
}

function appendObject_(sheet, tabName, headers, obj) {
  sheet.appendRow(rowToValues_(headers, obj, tabName))
}

function updateObjectRow_(sheet, tabName, headers, obj, rowNumber) {
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([rowToValues_(headers, obj, tabName)])
}

/** Append an audit entry to a spreadsheet's AuditLog tab. */
function appendAudit_(ss, tabName, entry) {
  var sh = ss.getSheetByName(tabName)
  if (!sh) return
  var headers = HEADERS[tabName]
  appendObject_(sh, tabName, headers, entry)
}

/** Run fn while holding the global script lock (serializes concurrent writes). */
function withLock_(fn) {
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    return fn()
  } finally {
    lock.releaseLock()
  }
}

// ---------------------------------------------------------------- master reads

function getTrips_() {
  var cached = cacheGet_('master.trips')
  if (cached) return cached
  var rows = readTable_(masterTab_(TAB.TRIPS), TAB.TRIPS).rows
  var trips = rows
    .filter(function (r) { return String(r.tripId || '').trim() !== '' })
    .map(function (r) {
      return {
        tripId: String(r.tripId).trim(),
        name: String(r.name || '').trim(),
        spreadsheetId: String(r.spreadsheetId || '').trim(),
        active: String(r.active).toUpperCase() === 'TRUE',
        startDate: r.startDate ? asDateYmd_(r.startDate) : '',
        endDate: r.endDate ? asDateYmd_(r.endDate) : '',
        sortOrder: asNumber_(r.sortOrder),
      }
    })
    .sort(function (a, b) { return a.sortOrder - b.sortOrder })
  cachePut_('master.trips', trips, 120)
  return trips
}

function getTripConfig_(tripId) {
  var trips = getTrips_()
  for (var i = 0; i < trips.length; i++) {
    if (trips[i].tripId === String(tripId)) return trips[i]
  }
  return null
}

function tripSS_(tripId) {
  var trip = getTripConfig_(tripId)
  if (!trip) throw new Error('Unknown trip id: ' + tripId)
  if (!trip.spreadsheetId) throw new Error('Trip "' + trip.name + '" has no spreadsheet configured. Re-run setupAll().')
  return SpreadsheetApp.openById(trip.spreadsheetId)
}

function tripTab_(tripId, tabName) {
  var ss = tripSS_(tripId)
  var sh = ss.getSheetByName(tabName)
  if (!sh) {
    throw new Error('Trip spreadsheet for ' + tripId + ' is missing the "' + tabName + '" tab. Run setupAll().')
  }
  return { ss: ss, sheet: sh }
}

// ---------------------------------------------------------------- settings

function getSettingsMap_() {
  var cached = cacheGet_('master.settings')
  if (cached) return cached
  var rows = readTable_(masterTab_(TAB.SETTINGS), TAB.SETTINGS).rows
  var map = {}
  for (var k in DEFAULT_SETTINGS) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k)) map[k] = DEFAULT_SETTINGS[k]
  }
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i].key || '').trim()
    if (key) map[key] = String(rows[i].value == null ? '' : rows[i].value).trim()
  }
  cachePut_('master.settings', map, 120)
  return map
}

function setting_(key, def) {
  var map = getSettingsMap_()
  var v = map[key]
  return v === undefined || v === '' ? (def !== undefined ? def : '') : v
}

function settingInt_(key, def) {
  var n = parseInt(setting_(key, String(def)), 10)
  return isFinite(n) ? n : def
}

function settingBool_(key, def) {
  var v = String(setting_(key, def ? 'true' : 'false')).toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

function activeCategoryNames_() {
  var cached = cacheGet_('master.categories')
  if (cached) return cached
  var rows = readTable_(masterTab_(TAB.CATEGORIES), TAB.CATEGORIES).rows
  var names = rows
    .filter(function (r) { return String(r.active).toUpperCase() !== 'FALSE' && String(r.name || '').trim() !== '' })
    .map(function (r) { return String(r.name).trim() })
  cachePut_('master.categories', names, 120)
  return names
}

// ---------------------------------------------------------------- trip data

function readExpenses_(tripId) {
  var cached = cacheGet_('expenses.' + tripId)
  if (cached) return cached
  var t = tripTab_(tripId, TAB.EXPENSES)
  var table = readTable_(t.sheet, TAB.EXPENSES)
  var rows = table.rows
    .filter(function (r) { return String(r.expenseId || '').trim() !== '' })
    .map(function (r) {
      return {
        expenseId: String(r.expenseId).trim(),
        tripId: String(r.tripId || tripId).trim(),
        expenseDate: asDateYmd_(r.expenseDate),
        submittedAt: asDateTimeText_(r.submittedAt),
        coordinatorId: String(r.coordinatorId || ''),
        coordinatorName: String(r.coordinatorName || ''),
        reason: String(r.reason || ''),
        category: String(r.category || ''),
        amount: asNumber_(r.amount),
        notes: String(r.notes || ''),
        receiptReference: String(r.receiptReference || ''),
        status: String(r.status || 'active').toLowerCase(),
        createdAt: asDateTimeText_(r.createdAt),
        updatedAt: asDateTimeText_(r.updatedAt),
        lastEditedBy: String(r.lastEditedBy || ''),
        clientRequestId: String(r.clientRequestId || ''),
        _row: r._row,
      }
    })
  var payload = { rows: rows, headers: table.headers }
  cachePut_('expenses.' + tripId, payload, 60)
  return payload
}

function readItinerary_(tripId) {
  var cached = cacheGet_('itinerary.' + tripId)
  if (cached) return cached
  var t = tripTab_(tripId, TAB.TRIP_PLAN)
  var rows = readTable_(t.sheet, TAB.TRIP_PLAN).rows
    .filter(function (r) { return String(r.stopId || '').trim() !== '' })
    .map(function (r) {
      return {
        stopId: String(r.stopId).trim(),
        tripId: String(r.tripId || tripId).trim(),
        sequence: asNumber_(r.sequence),
        locationName: String(r.locationName || ''),
        plannedArrival: asDateTimeText_(r.plannedArrival),
        plannedDeparture: asDateTimeText_(r.plannedDeparture),
        expectedDuration: String(r.expectedDuration || ''),
        notes: String(r.notes || ''),
        status: String(r.status || 'planned'),
        plannedArrivalMs: Ziyarah.parseSheetDateTime(asDateTimeText_(r.plannedArrival)),
      }
    })
    .sort(function (a, b) { return a.sequence - b.sequence })
  cachePut_('itinerary.' + tripId, rows, 60)
  return rows
}

function readProgress_(tripId) {
  var cached = cacheGet_('progress.' + tripId)
  if (cached) return cached
  var t = tripTab_(tripId, TAB.PROGRESS)
  var rows = readTable_(t.sheet, TAB.PROGRESS).rows
    .filter(function (r) { return String(r.progressId || '').trim() !== '' })
    .map(function (r) {
      return {
        progressId: String(r.progressId).trim(),
        tripId: String(r.tripId || tripId).trim(),
        stopId: String(r.stopId || ''),
        coordinatorId: String(r.coordinatorId || ''),
        actualArrival: asDateTimeText_(r.actualArrival),
        actualDeparture: asDateTimeText_(r.actualDeparture),
        delayMinutes: asNumber_(r.delayMinutes),
        status: String(r.status || ''),
        delayReason: String(r.delayReason || ''),
        notes: String(r.notes || ''),
        submittedAt: asDateTimeText_(r.submittedAt),
      }
    })
  cachePut_('progress.' + tripId, rows, 60)
  return rows
}

function readRatings_(tripId) {
  var cached = cacheGet_('ratings.' + tripId)
  if (cached) return cached
  var t = tripTab_(tripId, TAB.RATINGS)
  var rows = readTable_(t.sheet, TAB.RATINGS).rows
    .filter(function (r) { return String(r.ratingId || '').trim() !== '' })
    .map(function (r) {
      return {
        ratingId: String(r.ratingId).trim(),
        tripId: String(r.tripId || tripId).trim(),
        stopId: String(r.stopId || ''),
        reviewerId: String(r.reviewerId || ''),
        destination: asNumber_(r.destination),
        accommodation: asNumber_(r.accommodation),
        food: asNumber_(r.food),
        transport: asNumber_(r.transport),
        overall: asNumber_(r.overall),
        feedback: String(r.feedback || ''),
        submittedAt: asDateTimeText_(r.submittedAt),
      }
    })
  cachePut_('ratings.' + tripId, rows, 60)
  return rows
}

/** Trip-level budget (scope = trip). Category budgets reserved for later. */
function tripBudget_(tripId) {
  var rows = readTable_(masterTab_(TAB.BUDGETS), TAB.BUDGETS).rows
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]
    if (String(r.tripId) === String(tripId) && String(r.scope).toLowerCase() === 'trip') {
      return asNumber_(r.amount)
    }
  }
  return 0
}

/** Combined trip info: budget stats + expense counts + latest activity. */
function tripSnapshot_(trip) {
  var expenses = readExpenses_(trip.tripId).rows
  var budget = tripBudget_(trip.tripId)
  var stats = Ziyarah.computeBudgetStats(budget, Ziyarah.sumActiveExpenses(expenses))
  var latest = ''
  for (var i = 0; i < expenses.length; i++) {
    if (String(expenses[i].submittedAt) > latest) latest = String(expenses[i].submittedAt)
  }
  return {
    tripId: trip.tripId,
    name: trip.name,
    active: trip.active,
    startDate: trip.startDate || '',
    endDate: trip.endDate || '',
    hasBudget: stats.hasBudget,
    totalBudget: stats.totalBudget,
    spent: stats.spent,
    remaining: stats.remaining,
    usedPercent: stats.usedPercent,
    level: stats.level,
    expenseCount: Ziyarah.countActiveExpenses(expenses),
    voidCount: expenses.length - Ziyarah.countActiveExpenses(expenses),
    latestExpenseAt: latest,
    todaySpent: Ziyarah.sumActiveExpenses(Ziyarah.expensesOnDate(expenses, todayYmd_())),
  }
}
