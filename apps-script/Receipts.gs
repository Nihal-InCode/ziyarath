/**
 * Receipts.gs - optional receipt images.
 * Images are stored in a private Drive folder owned by the deployer and are
 * only retrievable through this API (authorization enforced per trip).
 * Private spreadsheets/Drive files are never made public.
 */

function receiptFolder_() {
  var props = props_()
  var folderId = props.getProperty('RECEIPT_FOLDER_ID')
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId)
    } catch (e) {
      // Folder was deleted; recreate below.
    }
  }
  var it = DriveApp.getFoldersByName('Ziyarath Receipts')
  if (!it.hasNext()) it = DriveApp.getFoldersByName('Ziyath Receipts') // legacy folder name
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder('Ziyarath Receipts')
  props.setProperty('RECEIPT_FOLDER_ID', folder.getId())
  return folder
}

var RECEIPT_MIME_OK = { 'image/jpeg': true, 'image/png': true, 'image/webp': true, 'image/heic': true, 'image/heif': true }

function handleReceiptUpload_(user, data) {
  if (!settingBool_('receipts_enabled', true)) {
    return fail_('bad_request', 'Receipt uploads are currently disabled.')
  }
  var tripId = String(data.tripId || '')
  var b64 = String(data.base64 || '')
  var mime = String(data.mime || 'image/jpeg')
  if (!RECEIPT_MIME_OK[mime]) return fail_('validation', 'Unsupported image type.', { mime: 'Use JPEG, PNG or WebP.' })
  if (!b64) return fail_('validation', 'Image data is required.', { base64: 'Required.' })
  if (b64.length > 2000000) {
    return fail_('validation', 'Image is too large. Please use a smaller photo (under ~1.5 MB).', { base64: 'Too large.' })
  }

  var now = nowIso_()
  var receiptId = Ziyarah.newId('RCP', Date.now(), function () { return Utilities.getUuid().slice(0, 6) })
  var ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, receiptId + '.' + ext)
  var folder = receiptFolder_()
  var file = folder.createFile(blob)
  file.setDescription('trip=' + tripId + '; by=' + user.userId + '; at=' + now)

  return ok_({
    receiptId: receiptId,
    fileId: file.getId(),
    name: file.getName(),
    size: file.getSize(),
    uploadedAt: now,
  })
}

function handleReceiptGet_(user, data) {
  var fileId = String(data.fileId || '')
  if (!fileId) return fail_('validation', 'fileId is required.', { fileId: 'Required.' })
  var file
  try {
    file = DriveApp.getFileById(fileId)
  } catch (e) {
    return fail_('not_found', 'Receipt not found.')
  }
  // Only receipts living in our managed folder are served.
  var folder = receiptFolder_()
  var parents = file.getParents()
  var allowed = false
  while (parents.hasNext()) {
    if (parents.next().getId() === folder.getId()) allowed = true
  }
  if (!allowed) return fail_('forbidden', 'This file is not a managed receipt.')

  var desc = file.getDescription() || ''
  var tripMatch = /trip=([^;]+)/.exec(desc)
  var receiptTrip = tripMatch ? tripMatch[1].trim() : ''
  if (receiptTrip && !Ziyarah.canAccessTrip(user, receiptTrip)) {
    return fail_('forbidden', 'You are not allowed to view this receipt.')
  }

  var blob = file.getBlob()
  return ok_({
    mime: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes()),
    name: file.getName(),
  })
}
