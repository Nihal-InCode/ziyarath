/**
 * Trips.gs - trip configuration, budgets, admin summaries.
 */

function handleTripsList_(user) {
  var trips = getTrips_()
  var out = []
  for (var i = 0; i < trips.length; i++) {
    if (user.role === Ziyarah.ROLE_ADMIN || user.tripIds.indexOf(trips[i].tripId) !== -1) {
      out.push({ tripId: trips[i].tripId, name: trips[i].name, active: trips[i].active })
    }
  }
  return ok_({ trips: out })
}

function handleTripsGet_(user, data) {
  var tripId = String(data.tripId || '')
  var trip = getTripConfig_(tripId)
  if (!trip) return fail_('not_found', 'Trip not found.')
  var snapshot = tripSnapshot_(trip)
  var coordinators = readUsers_()
    .filter(function (u) { return u.active && u.tripIds.indexOf(tripId) !== -1 })
    .map(publicUser_)
  return ok_({ trip: snapshot, coordinators: coordinators })
}

/** Admin dashboard: combined totals + one snapshot per trip. */
function handleTripsSummary_(user) {
  var cached = cacheGet_('summary.admin')
  if (cached) return ok_(cached)

  var trips = getTrips_().filter(function (t) { return t.active })
  var summaries = []
  var combinedBudget = 0
  var combinedSpent = 0
  var combinedCount = 0
  var hasAnyBudget = false

  for (var i = 0; i < trips.length; i++) {
    var snap = tripSnapshot_(trips[i])
    summaries.push(snap)
    combinedSpent = Math.round((combinedSpent + snap.spent) * 100) / 100
    combinedCount += snap.expenseCount
    if (snap.hasBudget) {
      hasAnyBudget = true
      combinedBudget = Math.round((combinedBudget + snap.totalBudget) * 100) / 100
    }
  }

  var activeCoordinators = 0
  var users = readUsers_()
  for (var u = 0; u < users.length; u++) {
    if (users[u].active && users[u].role === Ziyarah.ROLE_COORDINATOR) activeCoordinators++
  }

  var combinedStats = hasAnyBudget
    ? Ziyarah.computeBudgetStats(combinedBudget, combinedSpent)
    : { hasBudget: false, totalBudget: null, spent: combinedSpent, remaining: null, usedPercent: null, level: 'unknown' }

  var payload = {
    trips: summaries,
    combined: {
      totalBudget: combinedStats.totalBudget,
      spent: combinedStats.spent,
      remaining: combinedStats.remaining,
      usedPercent: combinedStats.usedPercent,
      hasBudget: combinedStats.hasBudget,
      level: combinedStats.level,
      expenseCount: combinedCount,
      activeTrips: trips.length,
      activeCoordinators: activeCoordinators,
    },
    generatedAt: nowIso_(),
  }
  cachePut_('summary.admin', payload, 45)
  return ok_(payload)
}

/** Coordinator dashboard summary for a single assigned trip. */
function handleTripDashboard_(user, data) {
  var tripId = String(data.tripId || '')
  var trip = getTripConfig_(tripId)
  if (!trip) return fail_('not_found', 'Trip not found.')
  var snapshot = tripSnapshot_(trip)
  var expenses = readExpenses_(tripId).rows
  var mine = expenses.filter(function (e) { return e.coordinatorId === user.userId })
  var recent = Ziyarah.sortExpensesByDateDesc(mine).slice(0, 8).map(expensePublic_)
  var byCategory = Ziyarah.groupSum(mine, function (e) { return e.category })
  var byDay = Ziyarah.dailyTotals(mine, null, null).slice(-14)
  var itinerary = readItinerary_(tripId)
  var progress = readProgress_(tripId)
  return ok_({
    trip: { tripId: trip.tripId, name: trip.name },
    budget: {
      hasBudget: snapshot.hasBudget,
      totalBudget: snapshot.totalBudget,
      spent: Ziyarah.sumActiveExpenses(mine),
      remaining: snapshot.hasBudget ? Math.round((snapshot.totalBudget - Ziyarah.sumActiveExpenses(mine)) * 100) / 100 : null,
      usedPercent: snapshot.hasBudget
        ? Math.round((Ziyarah.sumActiveExpenses(mine) / snapshot.totalBudget) * 10000) / 100
        : null,
      level: snapshot.hasBudget
        ? Ziyarah.budgetLevel(Math.round((Ziyarah.sumActiveExpenses(mine) / snapshot.totalBudget) * 10000) / 100)
        : 'unknown',
      tripSpentTotal: snapshot.spent,
    },
    totals: {
      expenseCount: Ziyarah.countActiveExpenses(mine),
      todaySpent: Ziyarah.sumActiveExpenses(Ziyarah.expensesOnDate(mine, todayYmd_())),
      todayYmd: todayYmd_(),
    },
    recent: recent,
    byCategory: byCategory,
    byDay: byDay,
    itinerary: itinerary.map(function (s) { return publicStop_(s, progress) }),
  })
}

function handleTripsUpdate_(user, data) {
  var tripId = String(data.tripId || '')
  var sh = masterTab_(TAB.TRIPS)
  var table = readTable_(sh, TAB.TRIPS)
  var row = null
  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i].tripId) === tripId) row = table.rows[i]
  }
  if (!row) return fail_('not_found', 'Trip not found.')
  var now = nowIso_()
  if (data.name !== undefined) row.name = Ziyarah.sanitizeText(data.name, 120) || row.name
  if (data.active !== undefined) row.active = data.active ? 'TRUE' : 'FALSE'
  if (data.startDate !== undefined) row.startDate = Ziyarah.sanitizeText(data.startDate, 20)
  if (data.endDate !== undefined) row.endDate = Ziyarah.sanitizeText(data.endDate, 20)
  row.updatedAt = now
  return withLock_(function () {
    updateObjectRow_(sh, TAB.TRIPS, HEADERS[TAB.TRIPS], row, row._row)
    appendAudit_(ssMaster_(), TAB.AUDIT, Ziyarah.buildAudit(user, 'trip.update', 'trip', tripId, tripId, now, 'Updated trip configuration'))
    cacheDrop_('master.trips')
    cacheDrop_('summary.admin')
    return ok_({ tripId: tripId, updated: true })
  })
}

function handleTripUpdateBudget_(user, data) {
  var tripId = String(data.tripId || '')
  if (!getTripConfig_(tripId)) return fail_('not_found', 'Trip not found.')
  var v = Ziyarah.validateBudget(data)
  if (!v.ok) return fail_('validation', 'Please correct the highlighted fields.', v.errors)
  var now = nowIso_()

  return withLock_(function () {
    var sh = masterTab_(TAB.BUDGETS)
    var table = readTable_(sh, TAB.BUDGETS)
    var row = null
    for (var i = 0; i < table.rows.length; i++) {
      var r = table.rows[i]
      if (String(r.tripId) === tripId && String(r.scope).toLowerCase() === 'trip') row = r
    }
    var previous = row ? asNumber_(row.amount) : null
    if (row) {
      row.amount = v.value.amount
      row.updatedAt = now
      row.updatedBy = user.userId
      updateObjectRow_(sh, TAB.BUDGETS, HEADERS[TAB.BUDGETS], row, row._row)
    } else {
      appendObject_(sh, TAB.BUDGETS, HEADERS[TAB.BUDGETS], {
        budgetId: Ziyarah.newId('BUD', Date.now(), function () { return Utilities.getUuid().slice(0, 6) }),
        tripId: tripId,
        scope: 'trip',
        category: '',
        amount: v.value.amount,
        updatedAt: now,
        updatedBy: user.userId,
      })
    }
    appendAudit_(
      ssMaster_(), TAB.AUDIT,
      Ziyarah.buildAudit(user, 'trip.updateBudget', 'budget', tripId, tripId, now, 'Budget set to ' + v.value.amount + ' (was ' + previous + ')'),
    )
    invalidateTripCaches_(tripId)
    return ok_({ tripId: tripId, totalBudget: v.value.amount })
  })
}

function handleCategoriesSave_(user, data) {
  var name = Ziyarah.sanitizeText(data.name, 80)
  if (!name) return fail_('validation', 'Category name is required.', { name: 'Required.' })
  var now = nowIso_()
  return withLock_(function () {
    var sh = masterTab_(TAB.CATEGORIES)
    var table = readTable_(sh, TAB.CATEGORIES)
    for (var i = 0; i < table.rows.length; i++) {
      var r = table.rows[i]
      if (String(r.name).toLowerCase() === name.toLowerCase() && String(r.active).toUpperCase() !== 'FALSE') {
        if (data.active === false || data.active === 'FALSE') {
          r.active = 'FALSE'
          updateObjectRow_(sh, TAB.CATEGORIES, HEADERS[TAB.CATEGORIES], r, r._row)
        }
        cacheDrop_('master.categories')
        return ok_({ categoryId: r.categoryId, name: r.name, active: false })
      }
      if (String(r.categoryId) === String(data.categoryId || '')) {
        r.name = name
        r.active = data.active === false || data.active === 'FALSE' ? 'FALSE' : 'TRUE'
        updateObjectRow_(sh, TAB.CATEGORIES, HEADERS[TAB.CATEGORIES], r, r._row)
        cacheDrop_('master.categories')
        appendAudit_(ssMaster_(), TAB.AUDIT, Ziyarah.buildAudit(user, 'category.update', 'category', r.categoryId, '', now, 'Category updated: ' + name))
        return ok_({ categoryId: r.categoryId, name: r.name, active: r.active === 'TRUE' })
      }
    }
    var categoryId = Ziyarah.newId('CAT', Date.now(), function () { return Utilities.getUuid().slice(0, 6) })
    appendObject_(sh, TAB.CATEGORIES, HEADERS[TAB.CATEGORIES], {
      categoryId: categoryId,
      name: name,
      active: 'TRUE',
      sortOrder: table.rows.length + 1,
      createdAt: now,
    })
    appendAudit_(ssMaster_(), TAB.AUDIT, Ziyarah.buildAudit(user, 'category.create', 'category', categoryId, '', now, 'Category created: ' + name))
    cacheDrop_('master.categories')
    return ok_({ categoryId: categoryId, name: name, active: true })
  })
}

function handleSettingsSave_(user, data) {
  var key = String(data.key || '')
  if (!EDITABLE_SETTINGS[key]) return fail_('forbidden', 'This setting cannot be changed from the app.')
  var value = Ziyarah.sanitizeText(data.value, 200)
  var now = nowIso_()
  return withLock_(function () {
    var sh = masterTab_(TAB.SETTINGS)
    var table = readTable_(sh, TAB.SETTINGS)
    var row = null
    for (var i = 0; i < table.rows.length; i++) {
      if (String(table.rows[i].key) === key) row = table.rows[i]
    }
    if (row) {
      row.value = value
      row.updatedAt = now
      row.updatedBy = user.userId
      updateObjectRow_(sh, TAB.SETTINGS, HEADERS[TAB.SETTINGS], row, row._row)
    } else {
      appendObject_(sh, TAB.SETTINGS, HEADERS[TAB.SETTINGS], { key: key, value: value, updatedAt: now, updatedBy: user.userId })
    }
    appendAudit_(ssMaster_(), TAB.AUDIT, Ziyarah.buildAudit(user, 'settings.update', 'setting', key, '', now, key + ' = ' + value))
    cacheDrop_('master.settings')
    return ok_({ key: key, value: value })
  })
}
