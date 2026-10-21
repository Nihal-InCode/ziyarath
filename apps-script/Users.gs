/**
 * Users.gs - admin management of coordinator/admin accounts.
 * Accounts are email-based with salted PBKDF2 password hashes (see Auth.gs).
 */

function handleUsersList_(user) {
  var users = readUsers_()
  var trips = getTrips_()
  var tripNames = {}
  for (var i = 0; i < trips.length; i++) tripNames[trips[i].tripId] = trips[i].name
  return ok_({
    users: users.map(function (u) {
      return {
        userId: u.userId,
        name: u.name,
        email: u.email,
        role: u.role,
        tripIds: u.tripIds,
        tripNames: u.tripIds.map(function (t) { return tripNames[t] || t }),
        active: u.active,
        createdAt: u.createdAt,
      }
    }),
  })
}

function handleUserCreate_(user, data) {
  var known = getTrips_().map(function (t) { return t.tripId })
  var v = Ziyarah.validateUser(data, { knownTrips: known })
  if (!v.ok) return fail_('validation', 'Please correct the highlighted fields.', v.errors)
  var pwErr = Ziyarah.validatePassword(data.password)
  if (pwErr) return fail_('validation', pwErr, { password: pwErr })

  return withLock_(function () {
    var existing = findUserByEmail_(v.value.email)
    if (existing) return fail_('conflict', 'A user with this email already exists.', { email: 'Already registered.' })
    var now = nowIso_()
    var record = {
      userId: Ziyarah.newId('USR', Date.now(), function () { return Utilities.getUuid().slice(0, 6) }),
      name: v.value.name,
      email: v.value.email,
      role: v.value.role,
      tripIds: v.value.tripIds,
      active: true,
      sessionVersion: 1,
      passwordHash: Ziyarah.hashPassword(String(data.password)),
      createdAt: now,
      updatedAt: now,
      createdBy: user.userId,
    }
    var sh = masterTab_(TAB.USERS)
    appendObject_(sh, TAB.USERS, HEADERS[TAB.USERS], record)
    appendAudit_(ssMaster_(), TAB.AUDIT, Ziyarah.buildAudit(user, 'user.create', 'user', record.userId, '', now, 'Created ' + record.role + ' ' + record.email + ' for trips: ' + (record.tripIds.join(', ') || '-')))
    cacheDrop_('master.users')
    return ok_({ user: publicUser_(record) })
  })
}

function handleUserUpdate_(user, data) {
  var userId = String(data.userId || '')
  if (!userId) return fail_('validation', 'userId is required.', { userId: 'Required.' })

  return withLock_(function () {
    var users = readUsers_()
    var record = null
    for (var i = 0; i < users.length; i++) if (users[i].userId === userId) record = users[i]
    if (!record) return fail_('not_found', 'User not found.')

    var known = getTrips_().map(function (t) { return t.tripId })
    var payload = {
      name: data.name !== undefined ? data.name : record.name,
      email: record.email,
      role: data.role !== undefined ? data.role : record.role,
      tripIds: data.tripIds !== undefined ? data.tripIds : record.tripIds,
    }
    var v = Ziyarah.validateUser(payload, { knownTrips: known })
    if (!v.ok) return fail_('validation', 'Please correct the highlighted fields.', v.errors)

    var now = nowIso_()
    var summaryParts = []
    if (record.name !== v.value.name) summaryParts.push('name: ' + record.name + ' -> ' + v.value.name)
    if (record.role !== v.value.role) summaryParts.push('role: ' + record.role + ' -> ' + v.value.role)
    if (record.tripIds.join(',') !== v.value.tripIds.join(',')) {
      summaryParts.push('trips: [' + record.tripIds.join(', ') + '] -> [' + v.value.tripIds.join(', ') + ']')
    }
    var wasActive = record.active
    if (data.active !== undefined && (data.active ? true : false) !== wasActive) {
      summaryParts.push('active: ' + wasActive + ' -> ' + (data.active ? true : false))
    }

    record.name = v.value.name
    record.role = v.value.role
    record.tripIds = v.value.tripIds
    if (data.active !== undefined) record.active = data.active ? true : false
    if (data.newPassword) {
      var pwErr = Ziyarah.validatePassword(data.newPassword)
      if (pwErr) return fail_('validation', pwErr, { newPassword: pwErr })
      record.passwordHash = Ziyarah.hashPassword(String(data.newPassword))
      summaryParts.push('password reset')
      record.sessionVersion = (Number(record.sessionVersion) || 1) + 1
    }
    // Disabling an account or changing role/trips revokes outstanding sessions.
    if ((!record.active || record.role !== v.value.role) && wasActive) {
      record.sessionVersion = (Number(record.sessionVersion) || 1) + 1
    }
    record.updatedAt = now

    var sh = masterTab_(TAB.USERS)
    updateObjectRow_(sh, TAB.USERS, HEADERS[TAB.USERS], record, record._row)
    appendAudit_(ssMaster_(), TAB.AUDIT, Ziyarah.buildAudit(user, 'user.update', 'user', record.userId, '', now, summaryParts.join('; ') || 'No field changes'))
    cacheDrop_('master.users')
    return ok_({ user: publicUser_(record) })
  })
}
