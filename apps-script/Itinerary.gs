/**
 * Itinerary.gs - trip plan (stops), progress and arrival recording.
 * Arrival times are server-generated (coordinator-tapped "Reached Location",
 * not GPS). Delay = actual arrival - planned arrival, with configurable tolerance.
 */

function publicStop_(stop, progressRows) {
  var arrival = null
  if (progressRows && progressRows.length) {
    for (var i = 0; i < progressRows.length; i++) {
      if (progressRows[i].stopId === stop.stopId) {
        var p = progressRows[i]
        var actualMs = Ziyarah.parseSheetDateTime(p.actualArrival)
        if (actualMs && (!arrival || actualMs < arrival.actualMs)) {
          arrival = {
            progressId: p.progressId,
            coordinatorId: p.coordinatorId,
            actualArrival: p.actualArrival,
            actualMs: actualMs,
            delayMinutes: p.delayMinutes,
            status: p.status,
            delayReason: p.delayReason,
            notes: p.notes,
          }
        }
      }
    }
  }
  var planMs = stop.plannedArrivalMs || Ziyarah.parseSheetDateTime(stop.plannedArrival)
  var delayText = null
  var scheduleStatus = 'upcoming'
  if (arrival) {
    scheduleStatus = arrival.status || 'on_time'
    var dm = Number(arrival.delayMinutes) || 0
    delayText = dm > 0 ? Ziyarah.formatDuration(dm) + ' late' : dm < 0 ? Ziyarah.formatDuration(-dm) + ' early' : 'On time'
  }
  return {
    stopId: stop.stopId,
    sequence: stop.sequence,
    locationName: stop.locationName,
    plannedArrival: stop.plannedArrival,
    plannedDeparture: stop.plannedDeparture,
    expectedDuration: stop.expectedDuration,
    notes: stop.notes,
    plannedArrivalMs: planMs,
    arrived: !!arrival,
    actualArrival: arrival ? arrival.actualArrival : null,
    arrivalStatus: arrival ? arrival.status : null,
    delayMinutes: arrival ? arrival.delayMinutes : 0,
    delayText: delayText,
    scheduleStatus: scheduleStatus,
    delayReason: arrival ? arrival.delayReason : '',
  }
}

function handleItineraryList_(user, data) {
  var tripId = String(data.tripId || '')
  var stops = readItinerary_(tripId)
  var progress = readProgress_(tripId)
  var out = stops.map(function (s) { return publicStop_(s, progress) })
  var currentStop = null
  for (var i = 0; i < out.length; i++) {
    if (!out[i].arrived) {
      currentStop = out[i].stopId
      break
    }
  }
  return ok_({ stops: out, currentStopId: currentStop })
}

function handleProgressList_(user, data) {
  var tripId = String(data.tripId || '')
  var rows = readProgress_(tripId)
  var stops = readItinerary_(tripId)
  var names = {}
  for (var i = 0; i < stops.length; i++) names[stops[i].stopId] = stops[i].locationName
  return ok_({
    rows: rows.map(function (r) {
      return {
        progressId: r.progressId,
        stopId: r.stopId,
        locationName: names[r.stopId] || r.stopId,
        coordinatorId: r.coordinatorId,
        actualArrival: r.actualArrival,
        delayMinutes: r.delayMinutes,
        status: r.status,
        delayReason: r.delayReason,
        notes: r.notes,
        submittedAt: r.submittedAt,
      }
    }),
  })
}

/** Admin: preload or replace a trip itinerary (validated, audited). */
function handleItinerarySave_(user, data) {
  var tripId = String(data.tripId || '')
  var stopsIn = data.stops
  if (!stopsIn || !stopsIn.length) {
    return fail_('validation', 'Add at least one stop.', { stops: 'At least one stop is required.' })
  }
  if (stopsIn.length > 100) {
    return fail_('validation', 'Too many stops (max 100).', { stops: 'Max 100 stops.' })
  }
  var seenSeq = {}
  var validated = []
  var errors = []
  for (var i = 0; i < stopsIn.length; i++) {
    var v = Ziyarah.validateStop(stopsIn[i])
    if (!v.ok) {
      errors.push({ index: i, errors: v.errors })
      continue
    }
    if (seenSeq[v.value.sequence]) {
      errors.push({ index: i, errors: { sequence: 'Duplicate sequence number.' } })
      continue
    }
    seenSeq[v.value.sequence] = true
    validated.push(v.value)
  }
  if (errors.length) return fail_('validation', 'Please correct the highlighted fields.', { stops: errors })

  validated.sort(function (a, b) { return a.sequence - b.sequence })
  var now = nowIso_()
  return withLock_(function () {
    var t = tripTab_(tripId, TAB.TRIP_PLAN)
    var existing = readItinerary_(tripId)
    var byId = {}
    for (var e = 0; e < existing.length; e++) byId[existing[e].stopId] = existing[e]

    // Reuse stop ids where the client supplies them, so historical progress
    // rows keep matching. Removed stops keep their history in Progress/Ratings.
    var finalStops = []
    for (var s = 0; s < validated.length; s++) {
      var item = validated[s]
      var stopId = item.stopId && byId[item.stopId]
        ? item.stopId
        : Ziyarah.newId('STP', Date.now() + s, function () { return Utilities.getUuid().slice(0, 6) })
      finalStops.push({
        stopId: stopId,
        tripId: tripId,
        sequence: item.sequence,
        locationName: item.locationName,
        plannedArrival: item.plannedArrival,
        plannedDeparture: item.plannedDeparture,
        expectedDuration: item.expectedDuration,
        notes: item.notes,
        status: 'planned',
      })
    }

    var lastRow = t.sheet.getLastRow()
    if (lastRow > 1) t.sheet.deleteRows(2, lastRow - 1)
    for (var w = 0; w < finalStops.length; w++) {
      appendObject_(t.sheet, TAB.TRIP_PLAN, HEADERS[TAB.TRIP_PLAN], finalStops[w])
    }
    appendAudit_(t.ss, TAB.AUDIT, Ziyarah.buildAudit(user, 'itinerary.save', 'itinerary', tripId, tripId, now, 'Saved ' + finalStops.length + ' stop(s)'))
    invalidateTripCaches_(tripId)
    return ok_({ stops: finalStops.map(function (st) { return publicStop_(st, []) }) })
  })
}

/**
 * progress.arrive - coordinator taps "Reached Location".
 * The arrival timestamp is generated on the server; delay vs the planned
 * stop time is computed with the configured tolerance.
 */
function handleArrive_(user, data) {
  var tripId = String(data.tripId || '')
  var stopId = String(data.stopId || '')
  if (!stopId) return fail_('validation', 'stopId is required.', { stopId: 'Required.' })

  var stops = readItinerary_(tripId)
  var stop = null
  for (var i = 0; i < stops.length; i++) {
    if (stops[i].stopId === stopId) stop = stops[i]
  }
  if (!stop) return fail_('not_found', 'Itinerary stop not found.')
  if (!stop.plannedArrivalMs) {
    return fail_('bad_request', 'This stop has no valid planned arrival time. Ask the administrator to fix the itinerary.')
  }

  var tolerance = settingInt_('arrival_tolerance_minutes', 10)
  var actual = new Date()
  var actualIso = nowIso_()
  var arrival = Ziyarah.computeArrival(stop.plannedArrivalMs, actual.getTime(), tolerance)
  var delayReason = Ziyarah.sanitizeText(data.delayReason, 120)
  var notes = Ziyarah.sanitizeText(data.notes, 500)

  if (arrival.status !== 'on_time' && !delayReason) {
    // Require a reason for late/early arrivals so the admin sees why.
    if (settingBool_('require_delay_reason', true)) {
      return fail_('validation', 'Please provide a reason for the delay.', {
        delayReason: 'Required when arriving early or late.',
      })
    }
  }

  return withLock_(function () {
    var progress = readProgress_(tripId)
    // Duplicate-tap protection: same coordinator, same stop, same Kolkata day.
    var today = Ziyarah.ymdInTz(actual, APP_TZ)
    for (var p = 0; p < progress.length; p++) {
      var row = progress[p]
      if (row.stopId === stopId && row.coordinatorId === user.userId) {
        var rowMs = Ziyarah.parseSheetDateTime(row.actualArrival)
        if (rowMs && Ziyarah.ymdInTz(new Date(rowMs), APP_TZ) === today) {
          return ok_({
            progress: {
              progressId: row.progressId,
              stopId: row.stopId,
              actualArrival: row.actualArrival,
              delayMinutes: row.delayMinutes,
              status: row.status,
              delayReason: row.delayReason,
            },
            duplicate: true,
          })
        }
      }
    }

    var t = tripTab_(tripId, TAB.PROGRESS)
    var record = {
      progressId: Ziyarah.newId('PRG', Date.now(), function () { return Utilities.getUuid().slice(0, 6) }),
      tripId: tripId,
      stopId: stopId,
      coordinatorId: user.userId,
      actualArrival: Utilities.formatDate(actual, APP_TZ, 'yyyy-MM-dd HH:mm'),
      actualDeparture: '',
      delayMinutes: arrival.signedMinutes,
      status: arrival.status,
      delayReason: delayReason,
      notes: notes,
      submittedAt: actualIso,
    }
    appendObject_(t.sheet, TAB.PROGRESS, HEADERS[TAB.PROGRESS], record)
    appendAudit_(
      t.ss, TAB.AUDIT,
      Ziyarah.buildAudit(user, 'progress.arrive', 'progress', record.progressId, tripId, actualIso,
        'Arrived at ' + stop.locationName + ' (' + arrival.status + ', ' + Ziyarah.formatDuration(Math.abs(arrival.signedMinutes)) + (arrival.signedMinutes >= 0 ? ' after' : ' before') + ' plan)'),
    )
    invalidateTripCaches_(tripId)
    return ok_({
      progress: {
        progressId: record.progressId,
        stopId: stopId,
        actualArrival: record.actualArrival,
        delayMinutes: record.delayMinutes,
        status: record.status,
        delayReason: record.delayReason,
      },
      duplicate: false,
    })
  })
}
