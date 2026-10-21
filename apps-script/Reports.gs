/**
 * Reports.gs - server-side report aggregation for the selected scope/filters.
 * Totals are always computed from saved sheet rows, never from client input.
 */

function handleReportsSummary_(user, data, scope) {
  var from = data.from ? String(data.from) : null
  var to = data.to ? String(data.to) : null
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) return fail_('validation', 'Invalid from date.', { from: 'Use YYYY-MM-DD.' })
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) return fail_('validation', 'Invalid to date.', { to: 'Use YYYY-MM-DD.' })
  if (from && to && from > to) return fail_('validation', 'From date must be before the to date.', { from: 'Must be before to date.' })

  var all = []
  for (var i = 0; i < scope.tripIds.length; i++) {
    var rows = readExpenses_(scope.tripIds[i]).rows
    for (var j = 0; j < rows.length; j++) all.push(rows[j])
  }
  var filtered = Ziyarah.filterExpenses(all, {
    tripIds: scope.tripIds,
    coordinatorIds: data.coordinatorIds && data.coordinatorIds.length ? data.coordinatorIds : null,
    categories: data.categories && data.categories.length ? data.categories : null,
    statuses: data.statuses && data.statuses.length ? data.statuses : ['active'],
    fromYmd: from,
    toYmd: to,
  })

  var report = Ziyarah.buildReport(filtered, { fromYmd: from, toYmd: to })

  // Budget stats only make sense for the full selected trips (not date-filtered).
  var budgets = []
  var trips = getTrips_()
  var byTripId = {}
  for (var t = 0; t < trips.length; t++) byTripId[trips[t].tripId] = trips[t]
  for (var s = 0; s < report.byTrip.length; s++) {
    var trip = byTripId[report.byTrip[s].key]
    if (!trip) continue
    var stats = Ziyarah.computeBudgetStats(tripBudget_(trip.tripId), Ziyarah.sumActiveExpenses(readExpenses_(trip.tripId).rows))
    budgets.push({
      tripId: trip.tripId,
      name: trip.name,
      totalBudget: stats.totalBudget,
      hasBudget: stats.hasBudget,
      spent: stats.spent,
      remaining: stats.remaining,
      usedPercent: stats.usedPercent,
      level: stats.level,
    })
  }

  var tripNames = {}
  for (var n = 0; n < trips.length; n++) tripNames[trips[n].tripId] = trips[n].name

  var rows = report.rows.map(function (e) {
    var pub = expensePublic_(e)
    pub.tripName = tripNames[e.tripId] || e.tripId
    return pub
  })

  return ok_({
    totals: report.totals,
    byDay: report.byDay,
    byCategory: report.byCategory,
    byCoordinator: report.byCoordinator,
    byTrip: report.byTrip.map(function (r) {
      return { tripId: r.key, name: tripNames[r.key] || r.key, total: r.total, count: r.count }
    }),
    budgets: budgets,
    rows: rows,
    filters: { from: from, to: to, tripIds: scope.tripIds },
    generatedAt: nowIso_(),
  })
}
