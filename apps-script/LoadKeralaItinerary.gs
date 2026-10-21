/**
 * LoadKeralaItinerary.gs - ONE-TIME import of the KERALAM FINAL.pdf schedule.
 * Run loadKeralaItinerary() from the Apps Script editor, then delete this file.
 * Day 1 = Friday 2026-10-23. Times are Asia/Kolkata.
 */

function loadKeralaItinerary() {
  var tripId = 'kerala'
  var stops = [
    // ---- Day 1 | Calicut - Markaz - Ponnani (~227 km)
    { d: 0, a: '08:00', p: '08:30', loc: 'Calicut Railway Station', notes: 'Day 1 | Arrival / start' },
    { d: 0, a: '08:40', p: '10:30', loc: 'Markaz', notes: 'Day 1 | Fresh-up + food | ~24 km' },
    { d: 0, a: '11:00', p: '11:45', loc: 'Madavoor', notes: 'Day 1 | Ziyarath | ~20 km' },
    { d: 0, a: '12:45', p: '14:00', loc: 'Markaz Knowledge City', notes: 'Day 1 | Food + prayer + visit | ~30 km' },
    { d: 0, a: '16:00', p: '16:30', loc: 'Mamburam', notes: 'Day 1 | Ziyarath / visit | ~63 km' },
    { d: 0, a: '16:50', p: '17:10', loc: 'Kundoor Maqam', notes: 'Day 1 | Maqam / ziyarath | ~12 km' },
    { d: 0, a: '18:10', p: '21:00', loc: 'Ponnani', notes: 'Day 1 | Ziyarath + beach + tea / leisure | ~39 km' },
    { d: 0, a: '22:30', p: '', loc: 'Isra Vadanappally', notes: 'Day 1 | Night stay | ~39 km' },

    // ---- Day 2 | Kodungallur - Kochi - Kuttanad (~230 km)
    { d: 1, a: '07:00', p: '07:30', loc: 'Isra Vadanappally', notes: 'Day 2 | Departure' },
    { d: 1, a: '08:15', p: '08:45', loc: 'Kodungallur Masjid', notes: 'Day 2 | Ziyarath + historical visit | ~27 km' },
    { d: 1, a: '10:00', p: '12:00', loc: 'Fort Kochi / Mattancherry / Jew Town', notes: 'Day 2 | Historical & heritage visit | ~32 km' },
    { d: 1, a: '14:30', p: '17:00', loc: 'Kuttanad', notes: 'Day 2 | Entertainment + prayer + food | ~65 km' },
    { d: 1, a: '18:15', p: '18:45', loc: 'Ochira', notes: 'Day 2 | Visit / stop | ~80 km' },
    { d: 1, a: '19:10', p: '19:50', loc: 'Karunagappali', notes: 'Day 2 | Ziyarath + prayer | ~11 km' },
    { d: 1, a: '21:00', p: '', loc: 'Qadissiya', notes: 'Day 2 | Night stay + fresh-up | ~15 km' },

    // ---- Day 3 | Varkala - Thiruvananthapuram - towards Munnar (~415 km)
    { d: 2, a: '07:00', p: '07:30', loc: 'Qadissiya', notes: 'Day 3 | Departure' },
    { d: 2, a: '08:00', p: '09:00', loc: 'Varkala Beach', notes: 'Day 3 | Beach / leisure | ~28 km' },
    { d: 2, a: '09:30', p: '10:00', loc: 'Kaduva Palli', notes: 'Day 3 | Ziyarath | ~15 km' },
    { d: 2, a: '11:30', p: '12:00', loc: 'Vizhinam Maqam', notes: 'Day 3 | Ziyarath | ~53 km' },
    { d: 2, a: '12:40', p: '18:00', loc: 'Thiruvananthapuram', notes: 'Day 3 | Zoo + Museum + prayer (ticket ₹2,310) | ~18 km' },
    { d: 2, a: '18:30', p: '21:00', loc: 'Beemapalli', notes: 'Day 3 | Prayer + ziyarath + fresh-up | ~10 km' },
    { d: 2, a: '21:30', p: '', loc: 'Bus / en route to Munnar', notes: 'Day 3 | Overnight travel at bus | ~291 km' },

    // ---- Day 4 | Munnar - hills & scenic stops (~352 km)
    { d: 3, a: '08:00', p: '09:00', loc: 'Munnar', notes: 'Day 4 | Morning arrival + visit' },
    { d: 3, a: '09:10', p: '09:40', loc: 'Mattupetty Dam', notes: 'Day 4 | View | ~10 km from Munnar' },
    { d: 3, a: '10:25', p: '10:55', loc: 'Echo Point', notes: 'Day 4 | View (ticket ₹990) | ~45 min travel | ~20 km' },
    { d: 3, a: '11:30', p: '12:00', loc: 'Kundala Dam', notes: 'Day 4 | View (ticket ₹660) | ~35 min travel | ~13 km' },
    { d: 3, a: '12:30', p: '13:00', loc: 'Mattupetty Dam (Boating)', notes: 'Day 4 | View + boating | ~30 min travel | ~15 km' },
    { d: 3, a: '13:30', p: '14:30', loc: 'Botanical Garden', notes: 'Day 4 | Visit (ticket ₹3,300) | ~30 min travel | ~12 km' },
    { d: 3, a: '15:00', p: '16:00', loc: 'Tea Museum', notes: 'Day 4 | Visit (ticket ₹4,950) | ~20 min travel | ~5 km' },
    { d: 3, a: '18:00', p: '19:00', loc: 'Adimali', notes: 'Day 4 | Prayer, food, rest | ~29 km' },
    { d: 4, a: '00:30', p: '', loc: 'Calicut Railway Station', notes: 'Day 5 | Return (~5.5 h travel after Adimali) | ~248 km | Trip total ~1,224 km' },
  ]

  var base = new Date(2026, 9, 23) // 2026-10-23, local editor tz is fine — only Y/M/D used
  function fmt(dayOffset, hm) {
    var dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset)
    var y = dt.getFullYear()
    var mo = ('0' + (dt.getMonth() + 1)).slice(-2)
    var da = ('0' + dt.getDate()).slice(-2)
    return y + '-' + mo + '-' + da + ' ' + hm
  }
  function dur(a, p) {
    if (!a || !p) return ''
    var am = a.split(':'), pm = p.split(':')
    var mins = (Number(pm[0]) * 60 + Number(pm[1])) - (Number(am[0]) * 60 + Number(am[1]))
    if (mins <= 0) return ''
    var h = Math.floor(mins / 60), m = mins % 60
    return (h ? h + 'h' : '') + (m ? (h ? ' ' : '') + m + 'm' : '') || ''
  }

  var t = tripTab_(tripId, TAB.TRIP_PLAN)
  var lastRow = t.sheet.getLastRow()
  if (lastRow > 1) t.sheet.deleteRows(2, lastRow - 1)

  for (var i = 0; i < stops.length; i++) {
    var s = stops[i]
    appendObject_(t.sheet, TAB.TRIP_PLAN, HEADERS[TAB.TRIP_PLAN], {
      stopId: Ziyarah.newId('STP', Date.now() + i, function () { return Utilities.getUuid().slice(0, 6) }),
      tripId: tripId,
      sequence: i + 1,
      locationName: s.loc,
      plannedArrival: fmt(s.d, s.a),
      plannedDeparture: s.p ? fmt(s.d, s.p) : '',
      expectedDuration: dur(s.a, s.p),
      notes: s.notes,
      status: 'planned',
    })
  }

  // Set trip start/end dates on the master Trips tab.
  var sh = masterTab_(TAB.TRIPS)
  var table = readTable_(sh, TAB.TRIPS)
  for (var r = 0; r < table.rows.length; r++) {
    if (String(table.rows[r].tripId) === tripId) {
      table.rows[r].startDate = '2026-10-23'
      table.rows[r].endDate = '2026-10-27'
      table.rows[r].updatedAt = nowIso_()
      updateObjectRow_(sh, TAB.TRIPS, HEADERS[TAB.TRIPS], table.rows[r], table.rows[r]._row)
      break
    }
  }

  invalidateTripCaches_(tripId)
  var msg = 'Loaded ' + stops.length + ' Kerala itinerary stops (2026-10-23 to 2026-10-27).'
  Logger.log(msg)
  return msg
}
