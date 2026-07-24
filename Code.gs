/**
 * King Creation — Lead Form Backend
 * ------------------------------------------------------------
 * Deploy this as a Google Apps Script Web App bound to a Google Sheet.
 * It does NOT change the existing form's design or fields on the site —
 * it only receives what the form already submits and handles:
 *
 *   1. Saving every lead as a row in the Sheet (source of truth — always
 *      happens first, before any notification is attempted).
 *   2. Keeping a real .xlsx snapshot of that Sheet up to date in Google Drive.
 *   3. Generating a one-page PDF summary of the lead.
 *   4. Emailing kingcreation2k7@gmail.com with the lead details, with the
 *      lead PDF and the current .xlsx snapshot attached.
 *   5. Sending a WhatsApp message to +91 6383833445 via Twilio, including
 *      a link to the lead PDF (media attachment — see notes below).
 *
 * Notification failures (steps 3-5) NEVER block or undo step 1 — the
 * lead is always saved even if WhatsApp, email, or PDF generation fails.
 * Each step is wrapped in its own try/catch for that reason.
 *
 * ---------------- SETUP ----------------
 * 1. Go to https://sheets.google.com and create a new spreadsheet
 *    (e.g. "King Creation Leads").
 * 2. In the sheet: Extensions > Apps Script.
 * 3. Delete any starter code and paste this entire file in.
 * 4. Fill in the CONFIG block below with your real Twilio credentials.
 * 5. Click Deploy > New deployment > select type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 6. Copy the deployment URL and paste it into index.html as GOOGLE_SCRIPT_URL.
 * 7. The first time it runs, Google will ask you to authorize permissions
 *    (Sheets, Drive, Docs, Gmail, and external requests to Twilio) — approve them.
 * ----------------------------------------
 */

// ==================== CONFIG — fill these in ====================
var SHEET_NAME = "Leads";
var XLSX_FILE_NAME = "King_Creation_Leads.xlsx";
var NOTIFY_EMAIL = "kingcreation2k7@gmail.com";
var NOTIFY_WHATSAPP_TO = "+916383833445"; // where the WhatsApp alert is sent

// Twilio WhatsApp API credentials — from https://console.twilio.com
var TWILIO_ACCOUNT_SID = "YOUR_TWILIO_ACCOUNT_SID";
var TWILIO_AUTH_TOKEN = "YOUR_TWILIO_AUTH_TOKEN";
// Your Twilio WhatsApp-enabled sender number (sandbox number while testing,
// e.g. "+14155238886", or your approved WhatsApp Business sender once live)
var TWILIO_WHATSAPP_FROM = "YOUR_TWILIO_WHATSAPP_NUMBER";

// If true, the per-lead PDF is shared as "anyone with the link" in Drive so
// Twilio can fetch it as a WhatsApp media attachment. Set to false if you'd
// rather WhatsApp alerts stay text-only (email still gets the PDF either way).
var WHATSAPP_ATTACH_PDF = true;
// ===================================================================

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet_(ss);
  var data = JSON.parse(e.postData.contents);
  var timestamp = new Date();

  // ---- 1. Save the lead. This must succeed before anything else runs. ----
  sheet.appendRow([
    timestamp,
    data.name || "",
    data.mobile || "",
    data.email || "",
    data.company || "",
    data.service || "",
    data.message || ""
  ]);

  var summary = buildSummary_(data, timestamp);

  // ---- 2. Best-effort: refresh the .xlsx snapshot in Drive. ----
  var xlsxBlob = null;
  try {
    xlsxBlob = updateXlsxSnapshot_(ss);
  } catch (err) {
    logError_("XLSX export failed: " + err);
  }

  // ---- 3. Best-effort: generate a one-page PDF for this specific lead. ----
  var pdfFile = null;
  try {
    pdfFile = generateLeadPdf_(data, timestamp);
  } catch (err) {
    logError_("PDF generation failed: " + err);
  }

  // ---- 4. Best-effort: email notification with PDF + XLSX attached. ----
  try {
    sendEmailNotification_(summary, pdfFile, xlsxBlob);
  } catch (err) {
    logError_("Email notification failed: " + err);
  }

  // ---- 5. Best-effort: WhatsApp notification via Twilio. ----
  try {
    sendWhatsAppNotification_(summary, pdfFile);
  } catch (err) {
    logError_("WhatsApp notification failed: " + err);
  }

  return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Date & Time", "Name", "Phone Number", "Email Address", "Company", "Service", "Message"]);
    sheet.getRange(1, 1, 1, 7).setFontWeight("bold");
  }
  return sheet;
}

function buildSummary_(data, timestamp) {
  return "New Lead — King Creation\n\n" +
    "Name: " + (data.name || "-") + "\n" +
    "Phone: " + (data.mobile || "-") + "\n" +
    "Email: " + (data.email || "-") + "\n" +
    "Company: " + (data.company || "-") + "\n" +
    "Service: " + (data.service || "-") + "\n" +
    "Message: " + (data.message || "-") + "\n\n" +
    "Submitted: " + timestamp.toLocaleString();
}

/**
 * Emails the lead summary to NOTIFY_EMAIL using MailApp — no SMTP
 * credentials needed, it sends from the Google account the script runs as.
 * Attaches the per-lead PDF and the current .xlsx snapshot when available.
 */
function sendEmailNotification_(summary, pdfFile, xlsxBlob) {
  var attachments = [];
  if (pdfFile) {
    attachments.push(pdfFile.getAs("application/pdf"));
  }
  if (xlsxBlob) {
    attachments.push(xlsxBlob);
  }

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: "New Lead — King Creation Website",
    body: summary,
    attachments: attachments
  });
}

/**
 * Sends the lead summary to WhatsApp via the Twilio WhatsApp API.
 * If WHATSAPP_ATTACH_PDF is true and a PDF was generated, includes it as a
 * media attachment (requires the PDF's Drive sharing to be link-viewable,
 * which generateLeadPdf_ already sets).
 */
function sendWhatsAppNotification_(summary, pdfFile) {
  if (TWILIO_ACCOUNT_SID.indexOf("YOUR_") === 0) {
    // Twilio not configured yet — skip silently rather than throwing repeatedly.
    logError_("WhatsApp skipped: Twilio credentials not configured.");
    return;
  }

  var url = "https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_ACCOUNT_SID + "/Messages.json";
  var payload = {
    From: "whatsapp:" + TWILIO_WHATSAPP_FROM,
    To: "whatsapp:" + NOTIFY_WHATSAPP_TO,
    Body: summary
  };

  if (WHATSAPP_ATTACH_PDF && pdfFile) {
    // Direct-download Drive link so Twilio can fetch the file as media.
    payload.MediaUrl = "https://drive.google.com/uc?export=download&id=" + pdfFile.getId();
  }

  var options = {
    method: "post",
    payload: payload,
    headers: {
      Authorization: "Basic " + Utilities.base64Encode(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN)
    },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    logError_("Twilio responded with status " + code + ": " + response.getContentText());
  }
}

/**
 * Exports the current state of the Sheet as a real .xlsx file, returns it
 * as a Blob (for email attachment), and keeps a single up-to-date copy of
 * it in Google Drive (replacing the previous version so it never
 * accumulates duplicates).
 */
function updateXlsxSnapshot_(ss) {
  var ssId = ss.getId();
  var token = ScriptApp.getOAuthToken();
  var exportUrl = "https://docs.google.com/spreadsheets/d/" + ssId + "/export?format=xlsx";

  var response = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: "Bearer " + token }
  });
  var blob = response.getBlob().setName(XLSX_FILE_NAME);

  // Remove any previous snapshot so Drive doesn't accumulate duplicate files.
  var existing = DriveApp.getFilesByName(XLSX_FILE_NAME);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  DriveApp.createFile(blob);
  return blob;
}

/**
 * Builds a one-page PDF summary for a single lead by writing to a temporary
 * Google Doc, exporting it as PDF, then discarding the temp Doc (only the
 * PDF file remains in Drive). Returns the Drive File object for the PDF.
 */
function generateLeadPdf_(data, timestamp) {
  var tempDocName = "temp-lead-" + timestamp.getTime();
  var doc = DocumentApp.create(tempDocName);
  var body = doc.getBody();

  body.appendParagraph("King Creation — New Lead").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Submitted: " + timestamp.toLocaleString());
  body.appendParagraph("");

  var rows = [
    ["Name", data.name || "-"],
    ["Phone", data.mobile || "-"],
    ["Email", data.email || "-"],
    ["Company", data.company || "-"],
    ["Service", data.service || "-"],
    ["Message", data.message || "-"]
  ];
  rows.forEach(function(row) {
    var p = body.appendParagraph(row[0] + ":  " + row[1]);
    p.editAsText().setBold(0, row[0].length, true);
  });

  doc.saveAndClose();

  var docFile = DriveApp.getFileById(doc.getId());
  var pdfBlob = docFile.getAs("application/pdf")
    .setName("Lead_" + (data.name || "Inquiry").replace(/[^a-zA-Z0-9]/g, "_") + ".pdf");

  var pdfFile = DriveApp.createFile(pdfBlob);
  // Let Twilio fetch it as WhatsApp media (view-only link, not editable).
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Clean up the temporary Google Doc — only the PDF needs to remain.
  docFile.setTrashed(true);

  return pdfFile;
}

function logError_(message) {
  try {
    Logger.log(message);
  } catch (err) {
    // no-op — logging must never throw
  }
}
