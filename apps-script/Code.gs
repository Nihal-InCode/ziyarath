/**
 * Code.gs - HTTP entry points and the action router.
 * Every protected action authenticates the session token and enforces
 * role + trip-scope authorization server-side before any data is touched.
 */

function doGet(e) {
  var action = e && e.parameter ? e.parameter.action : ''
  if (action === 'health') {
    return json_(ok_({ status: 'up', app: 'ziyarah', version: '1.0.0', time: nowIso_() }))
  }
  return json_(ok_({ app: 'ziyarah', api: 'POST', version: '1.0.0' }))
}

function doPost(e) {
  var body
  try {
    body = JSON.parse(e.postData.contents)
  } catch (err) {
    return json_(fail_('bad_request', 'Request body must be JSON.'))
  }
  var result
  try {
    result = routeRequest_(body)
  } catch (err) {
    log_('ERROR: ' + (err && err.stack ? err.stack : err))
    var msg = String(err && err.message ? err.message : 'Unexpected server error.')
    if (/not configured|is missing the|Unknown trip id/i.test(msg)) {
      return json_(fail_('config_error', msg))
    }
    return json_(fail_('server_error', msg))
  }
  return json_(result)
}

function routeRequest_(body) {
  var action = String((body && body.action) || '')
  var data = body && body.data && typeof body.data === 'object' ? body.data : {}

  if (!action) return fail_('bad_request', 'Missing action.')
  if (action === 'auth.login') return handleLogin_(data)

  var user = currentUser_(body && body.token)
  if (!user) return fail_('unauthenticated', 'Session expired. Please sign in again.')

  if (action === 'auth.session') return handleSession_(user)
  if (action === 'auth.logout') return handleLogout_(user)

  // List/report actions resolve their trip scope up front.
  if (action === 'expenses.list' || action === 'reports.summary') {
    var authList = Ziyarah.authorize(user, action, null)
    if (!authList.ok) return fail_(authList.code, authList.message)
    var requested = data.tripIds && data.tripIds.length ? data.tripIds : data.tripId ? [data.tripId] : null
    var scope = Ziyarah.scopedTripIds(user, requested)
    if (!scope.ok) return fail_(scope.code, scope.message)
    if (action === 'expenses.list') return handleExpenseList_(user, data, scope)
    return handleReportsSummary_(user, data, scope)
  }

  var tripId = data.tripId ? String(data.tripId) : null
  var auth = Ziyarah.authorize(user, action, tripId)
  if (!auth.ok) return fail_(auth.code, auth.message)

  switch (action) {
    case 'meta.bootstrap': return handleBootstrap_(user)
    case 'expenses.create': return handleExpenseCreate_(user, data)
    case 'expenses.get': return handleExpenseGet_(user, data)
    case 'expenses.update': return handleExpenseUpdate_(user, data)
    case 'expenses.correct': return handleExpenseCorrect_(user, data)
    case 'expenses.void': return handleExpenseVoid_(user, data)
    case 'expenses.restore': return handleExpenseRestore_(user, data)
    case 'trips.list': return handleTripsList_(user)
    case 'trips.summary': return handleTripsSummary_(user)
    case 'trips.get': return handleTripsGet_(user, data)
    case 'trips.dashboard': return handleTripDashboard_(user, data)
    case 'trips.update': return handleTripsUpdate_(user, data)
    case 'trips.updateBudget': return handleTripUpdateBudget_(user, data)
    case 'trips.saveItinerary': return handleItinerarySave_(user, data)
    case 'itinerary.list': return handleItineraryList_(user, data)
    case 'progress.list': return handleProgressList_(user, data)
    case 'progress.arrive': return handleArrive_(user, data)
    case 'ratings.submit': return handleRatingSubmit_(user, data)
    case 'ratings.list': return handleRatingsList_(user, data)
    case 'ratings.summary': return handleRatingsSummary_(user, data)
    case 'users.list': return handleUsersList_(user)
    case 'users.create': return handleUserCreate_(user, data)
    case 'users.update': return handleUserUpdate_(user, data)
    case 'users.changePassword': return handleChangePassword_(user, data)
    case 'receipts.upload': return handleReceiptUpload_(user, data)
    case 'receipts.get': return handleReceiptGet_(user, data)
    case 'categories.save': return handleCategoriesSave_(user, data)
    case 'settings.save': return handleSettingsSave_(user, data)
    default: return fail_('unknown_action', 'Unknown action: ' + action)
  }
}

/** meta.bootstrap - everything the signed-in client needs to render. */
function handleBootstrap_(user) {
  var trips = getTrips_()
  return ok_({
    user: publicUser_(user),
    trips: tripsForUser_(user, trips),
    categories: activeCategoryNames_().map(function (name) {
      return { name: name }
    }),
    settings: {
      arrivalToleranceMinutes: settingInt_('arrival_tolerance_minutes', 10),
      receiptsEnabled: settingBool_('receipts_enabled', true),
      allowRatingUpdates: settingBool_('allow_rating_updates', false),
      currency: 'INR',
      timeZone: APP_TZ,
    },
    serverTime: nowIso_(),
  })
}
