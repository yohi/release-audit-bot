const SHEET_NAME = 'repos';
const SECRET_PROPERTY = 'RELEASE_AUDIT_SECRET';

function doGet(e) {
  requireAuthorized_(e);
  if ((e.parameter.action || '') !== 'repos') {
    return json_({ error: 'unsupported action' });
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const repos = values.map((row, index) => rowToRepo_(headers, row, index + 2)).filter((repo) => repo.enabled);
  return json_({ repos });
}

function doPost(e) {
  requireAuthorized_(e);
  if ((e.parameter.action || '') !== 'update') {
    return json_({ error: 'unsupported action' });
  }
  const payload = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rowNumber = Number(payload.rowId);
  setCell_(sheet, headers, rowNumber, 'last_release_tag', payload.lastReleaseTag);
  setCell_(sheet, headers, rowNumber, 'last_release_time', payload.lastReleaseTime);
  setCell_(sheet, headers, rowNumber, 'last_checked_at', payload.lastCheckedAt);
  setCell_(sheet, headers, rowNumber, 'last_status', payload.lastStatus);
  setCell_(sheet, headers, rowNumber, 'last_error', payload.lastError);
  setCell_(sheet, headers, rowNumber, 'processing_tag', payload.processingTag);
  setCell_(sheet, headers, rowNumber, 'lock_until', payload.lockUntil);
  return json_(payload);
}

function rowToRepo_(headers, row, rowNumber) {
  return {
    rowId: String(rowNumber),
    repoUrl: String(value_(headers, row, 'repo_url')),
    enabled: String(value_(headers, row, 'enabled')).toUpperCase() === 'TRUE',
    feedType: String(value_(headers, row, 'feed_type') || 'releases'),
    lastReleaseTag: String(value_(headers, row, 'last_release_tag') || ''),
    lastReleaseTime: String(value_(headers, row, 'last_release_time') || ''),
  };
}

function value_(headers, row, name) {
  const index = headers.indexOf(name);
  return index < 0 ? '' : row[index];
}

function setCell_(sheet, headers, rowNumber, name, value) {
  const index = headers.indexOf(name);
  if (index < 0) {
    throw new Error(`missing column: ${name}`);
  }
  sheet.getRange(rowNumber, index + 1).setValue(value);
}

function requireAuthorized_(e) {
  const expected = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
  const actual = e.parameter.secret || '';
  if (!expected || actual !== expected) {
    throw new Error('unauthorized');
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
