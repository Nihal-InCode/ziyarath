/**
 * Expenses.gs - expense creation, listing, editing, void/restore.
 * All financial writes happen under the script lock and are audit-logged.
 */

function expensePublic_(e) {
  return {
    expenseId: e.expenseId,
    tripId: e.tripId,
    expenseDate: e.expenseDate,
    submittedAt: e.submittedAt,
    coordinatorId: e.coordinatorId,
    coordinatorName: e.coordinatorName,
    reason: e.reason,
    category: e.category,
    amount: e.amount,
    notes: e.notes,
    receiptReference: e.receiptReference,
    status: e.status,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    lastEditedBy: e.lastEditedBy,
  }
}

function handleExpenseCreate_(user, data) {
  var tripId = String(data.tripId || '')
  var trip = getTripConfig_(tripId)
  if (!trip || !trip.active) return fail_('bad_request', 'Unknown or inactive trip.')

  var ctx = { categories: activeCategoryNames_(), todayYmd: todayYmd_(), tripId: tripId }
  var v = Ziyarah.validateExpense(data, ctx)
  if (!v.ok) return fail_('validation', 'Please correct the highlighted fields.', v.errors)

  var t = tripTab_(tripId, TAB.EXPENSES)
  var now = nowIso_()

  return withLock_(function () {
    // Re-read under the lock so concurrent double-taps cannot race past the dedupe check.
    var current = readExpenses_(tripId).rows
    var dup = Ziyarah.findDuplicateExpense(current, v.value.clientRequestId, user.userId)
    if (dup) {
      return ok_({ expense: expensePublic_(dup), duplicate: true })
    }
    var record = {
      expenseId: Ziyarah.newId('EXP', Date.now(), function () { return Utilities.getUuid().slice(0, 6) }),
      tripId: tripId,
      expenseDate: v.value.expenseDate,
      // Authoritative server-side submission timestamp (UTC ISO).
      submittedAt: now,
      coordinatorId: user.userId,
      coordinatorName: user.name,
      reason: v.value.reason,
      category: v.value.category,
      amount: v.value.amount,
      notes: v.value.notes,
      receiptReference: Ziyarah.sanitizeText(data.receiptReference, 200),
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastEditedBy: user.userId,
      clientRequestId: v.value.clientRequestId || '',
    }
    appendObject_(t.sheet, TAB.EXPENSES, HEADERS[TAB.EXPENSES], record)
    var audit = Ziyarah.buildAudit(
      user, 'expense.create', 'expense', record.expenseId, tripId, now,
      'Created ' + record.category + ' expense of ' + record.amount + ' (' + record.reason + ')',
    )
    appendAudit_(t.ss, TAB.AUDIT, audit)
    invalidateTripCaches_(tripId)
    return ok_({ expense: expensePublic_(record), duplicate: false })
  })
}

/**
 * expenses.list - scoped, filtered, paginated.
 * Coordinators may only list their assigned trips; the trip scope is enforced
 * by the router via scopedTripIds() before this handler runs.
 */
function handleExpenseList_(user, data, scope) {
  var filters = {
    tripIds: scope.tripIds,
    coordinatorIds: data.coordinatorIds && data.coordinatorIds.length ? data.coordinatorIds : null,
    categories: data.categories && data.categories.length ? data.categories : null,
    statuses: data.statuses && data.statuses.length ? data.statuses : ['active'],
    fromYmd: data.from || null,
    toYmd: data.to || null,
    search: data.search || '',
  }
  var all = []
  for (var i = 0; i < scope.tripIds.length; i++) {
    var rows = readExpenses_(scope.tripIds[i]).rows
    for (var j = 0; j < rows.length; j++) all.push(rows[j])
  }
  // Coordinators only ever see their own rows in lists unless admin filters apply.
  if (user.role !== Ziyarah.ROLE_ADMIN) {
    all = all.filter(function (e) { return e.coordinatorId === user.userId })
  }
  var filtered = Ziyarah.filterExpenses(all, filters)
  filtered = Ziyarah.sortExpensesByDateDesc(filtered)

  var limit = Math.min(Math.max(parseInt(data.limit, 10) || 100, 1), 500)
  var offset = Math.max(parseInt(data.offset, 10) || 0, 0)
  var page = filtered.slice(offset, offset + limit).map(expensePublic_)

  var tripNames = {}
  var trips = getTrips_()
  for (var t = 0; t < trips.length; t++) tripNames[trips[t].tripId] = trips[t].name

  return ok_({
    rows: page.map(function (e) {
      e.tripName = tripNames[e.tripId] || e.tripId
      return e
    }),
    total: filtered.length,
    offset: offset,
    limit: limit,
    hasMore: offset + limit < filtered.length,
    countedTotal: Ziyarah.sumActiveExpenses(filtered),
  })
}

function findExpenseRow_(tripId, expenseId) {
  var data = readExpenses_(tripId)
  for (var i = 0; i < data.rows.length; i++) {
    if (data.rows[i].expenseId === String(expenseId)) return { expense: data.rows[i], headers: data.headers }
  }
  return null
}

function handleExpenseGet_(user, data, scope) {
  var tripId = String(data.tripId || '')
  var found = findExpenseRow_(tripId, String(data.expenseId || ''))
  if (!found) return fail_('not_found', 'Expense not found.')
  var ss = tripSS_(tripId)
  var auditRows = readTable_(ss.getSheetByName(TAB.AUDIT), TAB.AUDIT).rows
  var history = auditRows
    .filter(function (a) { return String(a.recordId) === String(data.expenseId) })
    .map(function (a) {
      return {
        auditId: String(a.auditId),
        userName: String(a.userName || ''),
        action: String(a.action || ''),
        timestamp: asDateTimeText_(a.timestamp),
        changeSummary: String(a.changeSummary || ''),
      }
    })
    .reverse()
  return ok_({ expense: expensePublic_(found.expense), history: history })
}

/** Shared write path for admin edit / void / restore. Always audit-logged. */
function mutateExpense_(user, data, mode) {
  var tripId = String(data.tripId || '')
  var t = tripTab_(tripId, TAB.EXPENSES)
  var now = nowIso_()

  return withLock_(function () {
    var found = findExpenseRow_(tripId, String(data.expenseId || ''))
    if (!found) return fail_('not_found', 'Expense not found.')
    var before = found.expense
    var after = {}
    for (var k in before) {
      if (Object.prototype.hasOwnProperty.call(before, k)) after[k] = before[k]
    }
    var summary = ''

    if (mode === 'update' || mode === 'correct') {
      if (mode === 'correct' && Ziyarah.isEmpty(data.correctionReason)) {
        return fail_('validation', 'A correction reason is required.', { correctionReason: 'Required for corrections.' })
      }
      var payload = {
        reason: data.reason !== undefined ? data.reason : before.reason,
        amount: data.amount !== undefined ? data.amount : before.amount,
        category: data.category !== undefined ? data.category : before.category,
        expenseDate: data.expenseDate !== undefined ? data.expenseDate : before.expenseDate,
        notes: data.notes !== undefined ? data.notes : before.notes,
        tripId: tripId,
        clientRequestId: before.clientRequestId || undefined,
      }
      var v = Ziyarah.validateExpense(payload, { categories: activeCategoryNames_(), todayYmd: todayYmd_(), tripId: tripId })
      if (!v.ok) return fail_('validation', 'Please correct the highlighted fields.', v.errors)
      after.reason = v.value.reason
      after.amount = v.value.amount
      after.category = v.value.category
      after.expenseDate = v.value.expenseDate
      after.notes = v.value.notes
      summary = Ziyarah.describeExpenseChanges(before, after)
      if (mode === 'correct') summary = 'Correction: ' + summary + ' | Reason: ' + Ziyarah.sanitizeText(data.correctionReason, 300)
    } else if (mode === 'void') {
      if (before.status === 'void') return fail_('bad_request', 'Expense is already void.')
      after.status = 'void'
      summary = 'Voided expense of ' + before.amount + ' (' + before.reason + ')'
      if (data.voidReason) summary += ' | Reason: ' + Ziyarah.sanitizeText(data.voidReason, 300)
    } else if (mode === 'restore') {
      if (before.status !== 'void') return fail_('bad_request', 'Expense is not void.')
      after.status = 'active'
      summary = 'Restored voided expense of ' + before.amount + ' (' + before.reason + ')'
    } else {
      return fail_('server_error', 'Unknown mutation mode.')
    }

    after.updatedAt = now
    after.lastEditedBy = user.userId
    updateObjectRow_(t.sheet, TAB.EXPENSES, HEADERS[TAB.EXPENSES], after, before._row)
    var audit = Ziyarah.buildAudit(user, 'expense.' + mode, 'expense', after.expenseId, tripId, now, summary)
    appendAudit_(t.ss, TAB.AUDIT, audit)
    invalidateTripCaches_(tripId)
    return ok_({ expense: expensePublic_(after) })
  })
}

function handleExpenseUpdate_(user, data) {
  return mutateExpense_(user, data, 'update')
}

function handleExpenseCorrect_(user, data) {
  return mutateExpense_(user, data, 'correct')
}

function handleExpenseVoid_(user, data) {
  return mutateExpense_(user, data, 'void')
}

function handleExpenseRestore_(user, data) {
  return mutateExpense_(user, data, 'restore')
}
