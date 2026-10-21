/**
 * Setup.gs - one-time initialization, safe to re-run.
 * Creates the master spreadsheet, the four trip spreadsheets and every tab.
 * NEVER overwrites existing data: tabs/rows are only appended when missing.
 *
 * Run setupAll() from the Apps Script editor after adding the files.
 * Then run the printed instructions (execution log shows created URLs).
 */

var MASTER_NAME = 'Ziyath Master - Travel Management'

function tripSheetName_(tripName) {
  return 'Ziyath Expenses - ' + tripName
}

function ensureTab_(ss, tabName) {
  var sh = ss.getSheetByName(tabName)
  if (!sh) {
    sh = ss.insertSheet(tabName)
    sh.appendRow(HEADERS[tabName])
    sh.setFrozenRows(1)
    return { sheet: sh, created: true }
  }
  // Upgrade existing tabs with any missing header columns (never touches data).
  if (sh.getLastRow() >= 1 && sh.getLastColumn() >= 1) {
    var existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim() })
    var missing = HEADERS[tabName].filter(function (h) { return existing.indexOf(h) === -1 })
    for (var m = 0; m < missing.length; m++) {
      sh.getRange(1, existing.length + m + 1).setValue(missing[m])
    }
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS[tabName])
    sh.setFrozenRows(1)
    return { sheet: sh, created: true }
  }
  return { sheet: sh, created: false }
}

function ensureTripTabs_(ss) {
  var created = []
  for (var i = 0; i < TRIP_TABS.length; i++) {
    var res = ensureTab_(ss, TRIP_TABS[i])
    if (res.created) created.push(TRIP_TABS[i])
  }
  return created
}

function upsertSetting_(key, value, createdBy) {
  var sh = masterTab_(TAB.SETTINGS)
  var table = readTable_(sh, TAB.SETTINGS)
  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i].key) === key) {
      return
    }
  }
  appendObject_(sh, TAB.SETTINGS, HEADERS[TAB.SETTINGS], {
    key: key,
    value: value,
    updatedAt: nowIso_(),
    updatedBy: createdBy || 'setup',
  })
}

function upsertCategory_(name, sortOrder) {
  var sh = masterTab_(TAB.CATEGORIES)
  var table = readTable_(sh, TAB.CATEGORIES)
  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i].name).toLowerCase() === String(name).toLowerCase()) return
  }
  appendObject_(sh, TAB.CATEGORIES, HEADERS[TAB.CATEGORIES], {
    categoryId: Ziyarah.newId('CAT', Date.now() + sortOrder, function () { return Utilities.getUuid().slice(0, 6) }),
    name: name,
    active: 'TRUE',
    sortOrder: sortOrder,
    createdAt: nowIso_(),
  })
}

function upsertTrip_(tripDef, index) {
  var sh = masterTab_(TAB.TRIPS)
  var table = readTable_(sh, TAB.TRIPS)
  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i].tripId) === tripDef.tripId) {
      return { tripId: tripDef.tripId, created: false, spreadsheetId: String(table.rows[i].spreadsheetId) }
    }
  }
  var ss = SpreadsheetApp.create(tripSheetName_(tripDef.name))
  ensureTripTabs_(ss)
  appendObject_(sh, TAB.TRIPS, HEADERS[TAB.TRIPS], {
    tripId: tripDef.tripId,
    name: tripDef.name,
    spreadsheetId: ss.getId(),
    active: 'TRUE',
    startDate: '',
    endDate: '',
    sortOrder: index + 1,
    createdAt: nowIso_(),
    updatedAt: nowIso_(),
  })
  return { tripId: tripDef.tripId, created: true, spreadsheetId: ss.getId(), url: ss.getUrl() }
}

/**
 * Main setup entry point. Safe to re-run: existing tabs, trips, settings,
 * categories and data are never overwritten.
 */
function setupAll() {
  var props = props_()
  var master
  var masterCreated = false
  var masterId = props.getProperty('MASTER_SPREADSHEET_ID')
  if (masterId) {
    master = SpreadsheetApp.openById(masterId)
  } else {
    master = SpreadsheetApp.create(MASTER_NAME)
    props.setProperty('MASTER_SPREADSHEET_ID', master.getId())
    masterCreated = true
  }

  var masterTabs = [TAB.TRIPS, TAB.USERS, TAB.BUDGETS, TAB.CATEGORIES, TAB.SETTINGS, TAB.AUDIT]
  for (var i = 0; i < masterTabs.length; i++) {
    ensureTab_(master, masterTabs[i])
  }

  for (var k in DEFAULT_SETTINGS) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k)) upsertSetting_(k, DEFAULT_SETTINGS[k], 'setup')
  }
  for (var c = 0; c < Ziyarah.DEFAULT_CATEGORIES.length; c++) {
    upsertCategory_(Ziyarah.DEFAULT_CATEGORIES[c], c + 1)
  }

  if (!props.getProperty('SESSION_SECRET')) {
    props.setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid())
  }

  var tripResults = []
  for (var t = 0; t < Ziyarah.DEFAULT_TRIPS.length; t++) {
    tripResults.push(upsertTrip_(Ziyarah.DEFAULT_TRIPS[t], t))
  }

  // Drop trip spreadsheet cache so newly created trips are visible immediately.
  cacheDrop_('master.trips')
  cacheDrop_('master.settings')
  cacheDrop_('master.categories')

  var lines = []
  lines.push('Setup complete.')
  lines.push('Master spreadsheet: ' + master.getUrl() + (masterCreated ? ' (created)' : ' (existing, unchanged)'))
  lines.push('Trip spreadsheets:')
  for (var r = 0; r < tripResults.length; r++) {
    var res = tripResults[r]
    lines.push(' - ' + res.tripId + ': ' + (res.created ? 'created ' + res.url : 'existing ' + res.spreadsheetId))
  }
  lines.push('Next: run createAdmin("you@example.com", "StrongPass123") from the editor, then Deploy -> New deployment -> Web app.')
  Logger.log(lines.join('\n'))
  return lines.join('\n')
}

/** Optional helper: manually attach an existing spreadsheet to a trip id. */
function attachTripSpreadsheet(tripId, spreadsheetId) {
  var sh = masterTab_(TAB.TRIPS)
  var table = readTable_(sh, TAB.TRIPS)
  for (var i = 0; i < table.rows.length; i++) {
    var row = table.rows[i]
    if (String(row.tripId) === String(tripId)) {
      row.spreadsheetId = String(spreadsheetId)
      row.updatedAt = nowIso_()
      ensureTripTabs_(SpreadsheetApp.openById(String(spreadsheetId)))
      updateObjectRow_(sh, TAB.TRIPS, HEADERS[TAB.TRIPS], row, row._row)
      cacheDrop_('master.trips')
      return 'Attached ' + spreadsheetId + ' to ' + tripId
    }
  }
  throw new Error('Trip id not found in master Trips tab: ' + tripId)
}

/**
 * Keep-alive: pings the deployment every 5 minutes so Google does not cold-start
 * it (cold starts add 5-15s to the first request). Run installKeepAlive() once
 * from the editor after deploying. Run removeKeepAlive() to disable.
 */
function keepAlivePing_() {
  // no-op: executing any function keeps the script instance warm
}

function installKeepAlive() {
  var existing = ScriptApp.getProjectTriggers()
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'keepAlivePing_') return 'Keep-alive already installed.'
  }
  ScriptApp.newTrigger('keepAlivePing_').timeBased().everyMinutes(5).create()
  return 'Keep-alive installed (pings every 5 minutes).'
}

function removeKeepAlive() {
  var existing = ScriptApp.getProjectTriggers()
  var removed = 0
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'keepAlivePing_') {
      ScriptApp.deleteTrigger(existing[i])
      removed++
    }
  }
  return 'Removed ' + removed + ' keep-alive trigger(s).'
}
