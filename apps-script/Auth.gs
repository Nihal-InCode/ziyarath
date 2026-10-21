/**
 * Auth.gs - email + password sign-in (PBKDF2-HMAC-SHA256, RFC 8018).
 * Passwords are stored only as salted hashes in the private master sheet.
 * No Google Cloud project, OAuth client or external identity provider required.
 * Sessions are stateless HMAC-signed tokens with expiry (see issueSessionToken_).
 */

function getSessionSecret_() {
  var props = props_()
  var secret = props.getProperty('SESSION_SECRET')
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid()
    props.setProperty('SESSION_SECRET', secret)
  }
  return secret
}

function b64UrlEncode_(bytes) {
  return Utilities.base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64UrlDecode_(str) {
  var s = String(str).replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Utilities.base64Decode(s)
}

function signPayload_(payloadJson) {
  var sig = Utilities.computeHmacSha256Signature(payloadJson, getSessionSecret_())
  return b64UrlEncode_(sig)
}

function issueSessionToken_(user) {
  var hours = settingInt_('session_hours', 12)
  if (hours < 1 || hours > 168) hours = 12
  var now = Date.now()
  var payload = {
    sub: String(user.userId),
    sv: Number(user.sessionVersion) || 1,
    iat: now,
    exp: now + hours * 3600 * 1000,
  }
  var json = JSON.stringify(payload)
  return 'v1.' + b64UrlEncode_(Utilities.newBlob(json).getBytes()) + '.' + signPayload_(json)
}

function parseSessionToken_(token) {
  var parts = String(token || '').split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  try {
    var json = Utilities.newBlob(b64UrlDecode_(parts[1])).getDataAsString()
    if (signPayload_(json) !== parts[2]) return null
    var payload = JSON.parse(json)
    if (!payload || !payload.sub) return null
    if (!payload.exp || Date.now() > Number(payload.exp)) return null
    return payload
  } catch (e) {
    return null
  }
}

// ---------------------------------------------------------------- brute-force guard
function lockKey_(email) {
  return 'loginlock.' + String(email || '').toLowerCase()
}

function loginLocked_(email) {
  var v = cacheGet_(lockKey_(email))
  return v && v.lockedUntil && Date.now() < v.lockedUntil
}

function recordLoginFailure_(email) {
  var key = lockKey_(email)
  var state = cacheGet_(key) || { fails: 0, lockedUntil: 0 }
  state.fails = (state.fails || 0) + 1
  if (state.fails >= 5) {
    state.lockedUntil = Date.now() + 5 * 60 * 1000 // 5-minute lockout
    state.fails = 0
  }
  cachePut_(key, state, 600)
}

function clearLoginFailures_(email) {
  cacheDrop_(lockKey_(email))
}

// ---------------------------------------------------------------- users

function readUsers_() {
  var cached = cacheGet_('master.users')
  if (cached) return cached
  var rows = readTable_(masterTab_(TAB.USERS), TAB.USERS).rows
  var users = rows
    .filter(function (r) { return String(r.userId || '').trim() !== '' })
    .map(function (r) {
      var raw = String(r.tripIds == null ? '' : r.tripIds)
      var tripIds = raw
        .split(',')
        .map(function (s) { return s.trim() })
        .filter(function (s) { return s !== '' })
      return {
        userId: String(r.userId).trim(),
        name: String(r.name || '').trim(),
        email: String(r.email || '').trim().toLowerCase(),
        role: String(r.role || '').trim().toLowerCase(),
        tripIds: tripIds,
        active: String(r.active).toUpperCase() === 'TRUE',
        sessionVersion: asNumber_(r.sessionVersion) || 1,
        passwordHash: String(r.passwordHash || ''),
        createdAt: asDateTimeText_(r.createdAt),
        updatedAt: asDateTimeText_(r.updatedAt),
        createdBy: String(r.createdBy || ''),
        _row: r._row,
      }
    })
  cachePut_('master.users', users, 60)
  return users
}

function findUserByEmail_(email) {
  var users = readUsers_()
  var target = String(email || '').toLowerCase()
  for (var i = 0; i < users.length; i++) {
    if (users[i].email === target) return users[i]
  }
  return null
}

function findUserById_(userId) {
  var users = readUsers_()
  var target = String(userId || '')
  for (var i = 0; i < users.length; i++) {
    if (users[i].userId === target) return users[i]
  }
  return null
}

function publicUser_(user) {
  return {
    userId: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    tripIds: user.tripIds,
    active: user.active,
  }
}

/** Resolve the authenticated user for a session token (null when invalid/expired). */
function currentUser_(token) {
  var payload = parseSessionToken_(token)
  if (!payload) return null
  var user = findUserById_(payload.sub)
  if (!user || !user.active) return null
  if (Number(user.sessionVersion) !== Number(payload.sv)) return null
  if (user.role !== Ziyarah.ROLE_ADMIN) return user
  // Admins may read every trip; attach the full trip catalog so scoped
  // list/report requests (expenses.list, reports.summary) can validate.
  // Copy first so the cached user record is never mutated.
  var scoped = {}
  for (var k in user) {
    if (Object.prototype.hasOwnProperty.call(user, k)) scoped[k] = user[k]
  }
  scoped.allTripIds = allTripIds_()
  return scoped
}

/** All trip ids (active and inactive) for admin list scoping. */
function allTripIds_() {
  var trips = getTrips_()
  var ids = []
  for (var i = 0; i < trips.length; i++) ids.push(trips[i].tripId)
  return ids
}

function tripsForUser_(user, trips) {
  var visible = []
  for (var i = 0; i < trips.length; i++) {
    if (!trips[i].active) continue
    if (user.role === Ziyarah.ROLE_ADMIN || user.tripIds.indexOf(trips[i].tripId) !== -1) {
      visible.push({ tripId: trips[i].tripId, name: trips[i].name })
    }
  }
  return visible
}

/** auth.login { email, password } */
function handleLogin_(data) {
  var email = String(data.email || '').trim().toLowerCase()
  var password = String(data.password || '')
  if (!email || !password) {
    return fail_('validation', 'Email and password are required.', {
      email: email ? undefined : 'Required.',
      password: password ? undefined : 'Required.',
    })
  }
  if (loginLocked_(email)) {
    return fail_('too_many_attempts', 'Too many failed sign-in attempts. Please wait 5 minutes and try again.')
  }

  var user = findUserByEmail_(email)
  if (!user || !user.passwordHash) {
    Ziyarah.dummyVerify(password) // equalize timing to limit user enumeration
    recordLoginFailure_(email)
    return fail_('unauthenticated', 'Incorrect email or password.')
  }
  if (!Ziyarah.verifyPassword(password, user.passwordHash)) {
    recordLoginFailure_(email)
    return fail_('unauthenticated', 'Incorrect email or password.')
  }
  if (!user.active) {
    return fail_('forbidden', 'Your account has been deactivated. Contact the administrator.')
  }

  clearLoginFailures_(email)
  var token = issueSessionToken_(user)
  var trips = getTrips_()
  return ok_({
    token: token,
    user: publicUser_(user),
    trips: tripsForUser_(user, trips),
    expiresInHours: settingInt_('session_hours', 12),
  })
}

function handleSession_(user) {
  var trips = getTrips_()
  return ok_({
    user: publicUser_(user),
    trips: tripsForUser_(user, trips),
    serverTime: nowIso_(),
  })
}

/** Logout revokes every outstanding session for this user (session_version bump). */
function handleLogout_(user) {
  return withLock_(function () {
    var fresh = findUserById_(user.userId)
    if (fresh) {
      var sh = masterTab_(TAB.USERS)
      fresh.sessionVersion = (Number(fresh.sessionVersion) || 1) + 1
      fresh.updatedAt = nowIso_()
      updateObjectRow_(sh, TAB.USERS, HEADERS[TAB.USERS], fresh, fresh._row)
      cacheDrop_('master.users')
    }
    return ok_({ loggedOut: true })
  })
}

/** users.changePassword { currentPassword, newPassword } - any signed-in user. */
function handleChangePassword_(user, data) {
  var current = String(data.currentPassword || '')
  var next = String(data.newPassword || '')
  var policyErr = Ziyarah.validatePassword(next)
  if (policyErr) return fail_('validation', policyErr, { newPassword: policyErr })

  var fresh = findUserById_(user.userId)
  if (!fresh) return fail_('unauthenticated', 'Session expired. Please sign in again.')
  if (!fresh.passwordHash || !Ziyarah.verifyPassword(current, fresh.passwordHash)) {
    return fail_('unauthenticated', 'Your current password is incorrect.', { currentPassword: 'Incorrect password.' })
  }

  return withLock_(function () {
    var latest = findUserById_(user.userId)
    latest.passwordHash = Ziyarah.hashPassword(next)
    latest.sessionVersion = (Number(latest.sessionVersion) || 1) + 1
    latest.updatedAt = nowIso_()
    var sh = masterTab_(TAB.USERS)
    updateObjectRow_(sh, TAB.USERS, HEADERS[TAB.USERS], latest, latest._row)
    appendAudit_(ssMaster_(), TAB.AUDIT, Ziyarah.buildAudit(latest, 'user.changePassword', 'user', latest.userId, '', nowIso_(), 'Password changed'))
    cacheDrop_('master.users')
    return ok_({ changed: true })
  })
}

// ---------------------------------------------------------------- editor utilities

/** Run from the Apps Script editor: create the first admin account. */
function createAdmin(email, password, name) {
  return createUserFromEditor_(email, password, name || String(email).split('@')[0], Ziyarah.ROLE_ADMIN, [])
}

/** Run from the Apps Script editor: create a coordinator account. */
function createCoordinator(email, password, name, tripIds) {
  return createUserFromEditor_(email, password, name, Ziyarah.ROLE_COORDINATOR, tripIds || [])
}

function createUserFromEditor_(email, password, name, role, tripIds) {
  var err = Ziyarah.validatePassword(password)
  if (err) throw new Error(err)
  var userErr = Ziyarah.validateUser({ name: name, email: email, role: role, tripIds: tripIds }, { knownTrips: getTrips_().map(function (t) { return t.tripId }) })
  if (!userErr.ok) throw new Error(JSON.stringify(userErr.errors))
  if (findUserByEmail_(userErr.value.email)) throw new Error('A user with this email already exists.')

  var now = nowIso_()
  var record = {
    userId: Ziyarah.newId('USR', Date.now(), function () { return Utilities.getUuid().slice(0, 6) }),
    name: userErr.value.name,
    email: userErr.value.email,
    role: userErr.value.role,
    tripIds: userErr.value.tripIds,
    active: true,
    sessionVersion: 1,
    passwordHash: Ziyarah.hashPassword(password),
    createdAt: now,
    updatedAt: now,
    createdBy: 'editor',
  }
  var sh = masterTab_(TAB.USERS)
  appendObject_(sh, TAB.USERS, HEADERS[TAB.USERS], record)
  appendAudit_(ssMaster_(), TAB.AUDIT, Ziyarah.buildAudit(record, 'user.create', 'user', record.userId, '', now, 'Created ' + role + ' ' + record.email + ' from editor'))
  cacheDrop_('master.users')
  var msg = 'Created ' + role + ': ' + record.email
  Logger.log(msg)
  return msg
}

/** Run from the Apps Script editor: reset a user's password (account recovery). */
function resetUserPassword(email, newPassword) {
  var err = Ziyarah.validatePassword(newPassword)
  if (err) throw new Error(err)
  var user = findUserByEmail_(email)
  if (!user) throw new Error('No user with this email: ' + email)
  return withLock_(function () {
    var latest = findUserById_(user.userId)
    latest.passwordHash = Ziyarah.hashPassword(newPassword)
    latest.sessionVersion = (Number(latest.sessionVersion) || 1) + 1
    latest.updatedAt = nowIso_()
    var sh = masterTab_(TAB.USERS)
    updateObjectRow_(sh, TAB.USERS, HEADERS[TAB.USERS], latest, latest._row)
    appendAudit_(ssMaster_(), TAB.AUDIT, Ziyarah.buildAudit(latest, 'user.resetPassword', 'user', latest.userId, '', nowIso_(), 'Password reset from editor'))
    cacheDrop_('master.users')
    var msg = 'Password reset for ' + latest.email
    Logger.log(msg)
    return msg
  })
}
