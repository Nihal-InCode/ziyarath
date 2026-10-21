/**
 * Ratings.gs - five-star ratings and feedback per stop, with duplicate control.
 */

function handleRatingSubmit_(user, data) {
  var tripId = String(data.tripId || '')
  var v = Ziyarah.validateRating(data)
  if (!v.ok) return fail_('validation', 'Please correct the highlighted fields.', v.errors)

  var stopId = v.value.stopId
  var stops = readItinerary_(tripId)
  if (stopId) {
    var found = false
    for (var i = 0; i < stops.length; i++) if (stops[i].stopId === stopId) found = true
    if (!found) return fail_('not_found', 'Itinerary stop not found.')
  }

  var now = nowIso_()
  var allowUpdate = settingBool_('allow_rating_updates', false) || user.role === Ziyarah.ROLE_ADMIN && data.update

  return withLock_(function () {
    var ratings = readRatings_(tripId)
    var existing = null
    for (var r = 0; r < ratings.length; r++) {
      if (ratings[r].reviewerId === user.userId && ratings[r].stopId === stopId) existing = ratings[r]
    }
    if (existing) {
      if (!allowUpdate) {
        return fail_(
          'conflict',
          'You have already submitted ratings for this stop. An administrator can allow updates in Settings.',
          { existing: existing.ratingId },
        )
      }
      var t = tripTab_(tripId, TAB.RATINGS)
      var after = {}
      for (var k in existing) {
        if (Object.prototype.hasOwnProperty.call(existing, k)) after[k] = existing[k]
      }
      after.destination = v.value.destination
      after.accommodation = v.value.accommodation
      after.food = v.value.food
      after.transport = v.value.transport
      after.overall = v.value.overall
      after.feedback = v.value.feedback
      after.submittedAt = now
      updateObjectRow_(t.sheet, TAB.RATINGS, HEADERS[TAB.RATINGS], after, existing._row)
      appendAudit_(t.ss, TAB.AUDIT, Ziyarah.buildAudit(user, 'rating.update', 'rating', existing.ratingId, tripId, now, 'Rating updated for stop ' + (stopId || '-')))
      invalidateTripCaches_(tripId)
      return ok_({ rating: publicRating_(after), updated: true })
    }

    var sheetData = tripTab_(tripId, TAB.RATINGS)
    var record = {
      ratingId: Ziyarah.newId('RAT', Date.now(), function () { return Utilities.getUuid().slice(0, 6) }),
      tripId: tripId,
      stopId: stopId,
      reviewerId: user.userId,
      destination: v.value.destination,
      accommodation: v.value.accommodation,
      food: v.value.food,
      transport: v.value.transport,
      overall: v.value.overall,
      feedback: v.value.feedback,
      submittedAt: now,
    }
    appendObject_(sheetData.sheet, TAB.RATINGS, HEADERS[TAB.RATINGS], record)
    appendAudit_(sheetData.ss, TAB.AUDIT, Ziyarah.buildAudit(user, 'rating.submit', 'rating', record.ratingId, tripId, now, 'Overall rating ' + record.overall + '/5'))
    invalidateTripCaches_(tripId)
    return ok_({ rating: publicRating_(record), updated: false })
  })
}

function publicRating_(r) {
  return {
    ratingId: r.ratingId,
    tripId: r.tripId,
    stopId: r.stopId,
    reviewerId: r.reviewerId,
    destination: r.destination,
    accommodation: r.accommodation,
    food: r.food,
    transport: r.transport,
    overall: r.overall,
    feedback: r.feedback,
    submittedAt: r.submittedAt,
  }
}

function ratingsAverages_(ratings) {
  var fields = ['destination', 'accommodation', 'food', 'transport', 'overall']
  var out = { count: ratings.length }
  for (var f = 0; f < fields.length; f++) {
    var key = fields[f]
    var total = 0
    for (var i = 0; i < ratings.length; i++) total += Number(ratings[i][key]) || 0
    out[key] = ratings.length ? Math.round((total / ratings.length) * 100) / 100 : null
  }
  return out
}

function handleRatingsList_(user, data) {
  var tripId = String(data.tripId || '')
  var ratings = readRatings_(tripId)
  var stops = readItinerary_(tripId)
  var names = {}
  for (var i = 0; i < stops.length; i++) names[stops[i].stopId] = stops[i].locationName

  // Coordinators see their own submissions plus per-stop averages, not raw
  // reviewer identities of others.
  var rows
  if (user.role === Ziyarah.ROLE_ADMIN) {
    rows = ratings.map(function (r) {
      var pub = publicRating_(r)
      pub.locationName = names[r.stopId] || r.stopId
      return pub
    })
  } else {
    rows = ratings
      .filter(function (r) { return r.reviewerId === user.userId })
      .map(function (r) {
        var pub = publicRating_(r)
        pub.locationName = names[r.stopId] || r.stopId
        return pub
      })
  }

  var byStop = {}
  for (var s = 0; s < stops.length; s++) {
    var subset = ratings.filter(function (r) { return r.stopId === stops[s].stopId })
    if (!subset.length) continue
    var avg = ratingsAverages_(subset)
    avg.stopId = stops[s].stopId
    avg.locationName = stops[s].locationName
    byStop[stops[s].stopId] = avg
  }

  return ok_({ rows: rows, averages: ratingsAverages_(ratings), byStop: byStop })
}

function handleRatingsSummary_(user, data) {
  var tripId = String(data.tripId || '')
  var ratings = readRatings_(tripId)
  var stops = readItinerary_(tripId)
  var names = {}
  for (var i = 0; i < stops.length; i++) names[stops[i].stopId] = stops[i].locationName
  var byStop = []
  for (var s = 0; s < stops.length; s++) {
    var subset = ratings.filter(function (r) { return r.stopId === stops[s].stopId })
    if (!subset.length) continue
    var avg = ratingsAverages_(subset)
    avg.stopId = stops[s].stopId
    avg.locationName = stops[s].locationName
    byStop.push(avg)
  }
  var feedback = ratings
    .filter(function (r) { return r.feedback })
    .map(function (r) {
      return { stopId: r.stopId, locationName: names[r.stopId] || r.stopId, overall: r.overall, feedback: r.feedback, submittedAt: r.submittedAt }
    })
    .reverse()
  return ok_({ averages: ratingsAverages_(ratings), byStop: byStop, feedback: feedback })
}
