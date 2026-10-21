/**
 * Config.gs - constants, script properties, settings, response helpers.
 * All secrets (spreadsheet ids, session secret) live in
 * Script Properties or private spreadsheets - never in the frontend.
 */

var APP_TZ = 'Asia/Kolkata'

var TAB = {
  EXPENSES: 'Expenses',
  TRIP_PLAN: 'TripPlan',
  PROGRESS: 'Progress',
  RATINGS: 'Ratings',
  AUDIT: 'AuditLog',
  TRIPS: 'Trips',
  USERS: 'Users',
  BUDGETS: 'Budgets',
  CATEGORIES: 'Categories',
  SETTINGS: 'Settings',
}

var TRIP_TABS = [TAB.EXPENSES, TAB.TRIP_PLAN, TAB.PROGRESS, TAB.RATINGS, TAB.AUDIT]

var HEADERS = {}
HEADERS[TAB.EXPENSES] = ['Expense ID', 'Trip ID', 'Expense Date', 'Submitted At', 'Coordinator ID', 'Coordinator Name', 'Reason', 'Category', 'Amount', 'Notes', 'Receipt Reference', 'Status', 'Created At', 'Updated At', 'Last Edited By', 'Client Request ID']
HEADERS[TAB.TRIP_PLAN] = ['Stop ID', 'Trip ID', 'Sequence Number', 'Location Name', 'Planned Arrival', 'Expected Departure', 'Expected Duration', 'Notes', 'Status']
HEADERS[TAB.PROGRESS] = ['Progress ID', 'Trip ID', 'Stop ID', 'Coordinator ID', 'Actual Arrival', 'Actual Departure', 'Delay in Minutes', 'Status', 'Delay Reason', 'Notes', 'Submitted At']
HEADERS[TAB.RATINGS] = ['Rating ID', 'Trip ID', 'Stop ID', 'Reviewer ID', 'Destination Rating', 'Accommodation Rating', 'Food Rating', 'Transport Rating', 'Overall Rating', 'Feedback', 'Submitted At']
HEADERS[TAB.AUDIT] = ['Audit ID', 'User ID', 'User Name', 'Action', 'Record Type', 'Record ID', 'Trip ID', 'Timestamp', 'Change Summary']
HEADERS[TAB.TRIPS] = ['Trip ID', 'Name', 'Spreadsheet ID', 'Active', 'Start Date', 'End Date', 'Sort Order', 'Created At', 'Updated At']
HEADERS[TAB.USERS] = ['User ID', 'Name', 'Email', 'Role', 'Trip IDs', 'Active', 'Session Version', 'Created At', 'Updated At', 'Created By', 'Password Hash']
HEADERS[TAB.BUDGETS] = ['Budget ID', 'Trip ID', 'Scope', 'Category', 'Amount', 'Updated At', 'Updated By']
HEADERS[TAB.CATEGORIES] = ['Category ID', 'Name', 'Active', 'Sort Order', 'Created At']
HEADERS[TAB.SETTINGS] = ['Key', 'Value', 'Updated At', 'Updated By']

/** Keys an admin may change from the UI (allowlist). */
var EDITABLE_SETTINGS = {
  arrival_tolerance_minutes: true,
  session_hours: true,
  receipts_enabled: true,
  allow_rating_updates: true,
  require_delay_reason: true,
}

var DEFAULT_SETTINGS = {
  arrival_tolerance_minutes: '10',
  session_hours: '12',
  receipts_enabled: 'true',
  allow_rating_updates: 'false',
  require_delay_reason: 'true',
}

function props_() {
  return PropertiesService.getScriptProperties()
}

function masterId_() {
  var id = props_().getProperty('MASTER_SPREADSHEET_ID')
  if (!id) {
    throw new Error('MASTER_SPREADSHEET_ID is not configured. Open the Apps Script editor and run setupAll() once.')
  }
  return id
}

function ok_(data) {
  return { ok: true, data: data }
}

function fail_(code, message, details) {
  return { ok: false, error: { code: code, message: message, details: details || null } }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

function nowIso_() {
  return new Date().toISOString()
}

function todayYmd_() {
  return Ziyarah.ymdInTz(new Date(), APP_TZ)
}

function log_(msg) {
  Logger.log(msg)
}

/**
 * Per-execution memory cache to avoid repeated sheet reads in one request.
 */
var _memCache = {}

function memGet_(key) {
  return Object.prototype.hasOwnProperty.call(_memCache, key) ? _memCache[key] : null
}

function memSet_(key, value) {
  _memCache[key] = value
  return value
}

function cacheGet_(key) {
  var v = memGet_(key)
  if (v !== null) return v
  try {
    var raw = CacheService.getScriptCache().get(key)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}

function cachePut_(key, value, seconds) {
  memSet_(key, value)
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), seconds || 60)
  } catch (e) {
    // Cache is best-effort only.
  }
}

function cacheDrop_(key) {
  delete _memCache[key]
  try {
    CacheService.getScriptCache().remove(key)
  } catch (e) {
    // ignore
  }
}

function invalidateTripCaches_(tripId) {
  cacheDrop_('expenses.' + tripId)
  cacheDrop_('summary.admin')
  cacheDrop_('itinerary.' + tripId)
  cacheDrop_('progress.' + tripId)
  cacheDrop_('ratings.' + tripId)
}

/** Quote-prefix text so Sheets never coerces date-like strings into Date objects. */
function text_(s) {
  if (s === null || s === undefined) return ''
  var str = String(s)
  if (str.charAt(0) === "'") return str
  return "'" + str
}

function stripApostrophe_(s) {
  var str = String(s == null ? '' : s)
  return str.charAt(0) === "'" ? str.slice(1) : str
}

/**
 * Convert a cell value that may be a Date (Sheets coerced it) or text
 * into 'YYYY-MM-DD HH:mm' text in Asia/Kolkata.
 */
function asDateTimeText_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, APP_TZ, 'yyyy-MM-dd HH:mm')
  }
  return stripApostrophe_(value)
}

function asDateYmd_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, APP_TZ, 'yyyy-MM-dd')
  }
  return stripApostrophe_(value).slice(0, 10)
}

function asNumber_(value) {
  var n = Number(value)
  return isFinite(n) ? n : 0
}
