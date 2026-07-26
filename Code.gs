/**
 * King Creation — Automated Lead Management System
 * ------------------------------------------------------------
 * Handles TWO lead sources with one shared notification pipeline:
 *
 *   A) Google Form submissions — https://docs.google.com/forms/d/e/1FAIpQLSdD2fkQV-PkUFWPDd2E6QeXSa3r92O02YEzM9HE4NERk1IoDQ/viewform
 *      Monitored automatically via an installable trigger — fires for
 *      every new response with zero manual steps after one-time setup.
 *   B) The website's own contact form — via doPost() (deployed as a
 *      Web App; unchanged design/fields on the site itself).
 *
 * For every new lead, from either source:
 *   1. The lead is saved FIRST (Google Forms saves it automatically for
 *      source A; this script saves it for source B) — before any
 *      notification runs, and never undone if a notification fails.
 *   2. A one-page PDF summary of the lead is generated.
 *   3. The response sheet is exported as an up-to-date
 *      King_Creation_Leads.xlsx snapshot in Google Drive.
 *   4. A WhatsApp message is sent to +91 6383833445 via Twilio (PDF attached).
 *   5. An email is sent to kingcreation2k7@gmail.com (PDF + xlsx attached).
 *
 * Steps 2-5 each run in their own try/catch — a failure in any one of
 * them never blocks the save or the other steps.
 *
 * Duplicate protection: installable form-submit triggers can occasionally
 * re-fire on the same response if a run times out and Apps Script retries
 * it. onFormSubmit() tracks the last-processed row in Script Properties
 * and skips anything already handled, so notifications never send twice
 * for the same submission.
 *
 * ---------------- ONE-TIME SETUP ----------------
 * 1. Open the Form → Responses tab → green Sheets icon → View/Create
 *    spreadsheet (this is the response Sheet the script attaches to).
 * 2. In that Sheet: Extensions → Apps Script.
 * 3. Delete any placeholder code and paste this entire file in.
 * 4. Fill in the CONFIG block below with your real Twilio credentials.
 * 5. In the Apps Script editor toolbar, select the function "setup" from
 *    the dropdown next to the Run button, then click Run. Authorize the
 *    permissions it asks for (Sheets, Drive, Docs, Gmail, external
 *    requests). This installs the "On form submit" trigger — after this
 *    one run, every future Form submission fires the workflow
 *    automatically, with no further manual steps. Safe to re-run any
 *    time (e.g. after editing the script) — it won't create duplicates.
 * 6. (Optional, for the website's own form) Deploy → New deployment →
 *    Web app, execute as Me, access "Anyone" — copy the URL into
 *    GOOGLE_SCRIPT_URL in index.html.
 * --------------------------------------------------
 */

// ==================== CONFIG — fill these in ====================
var WEBSITE_SHEET_NAME = "Leads";          // tab used for direct website submissions (path B)
var XLSX_FILE_NAME = "King_Creation_Leads.xlsx";
var NOTIFY_EMAIL = "kingcreation2k7@gmail.com";
var NOTIFY_WHATSAPP_TO = "+916383833445";

// Twilio WhatsApp API credentials — from https://console.twilio.com
var TWILIO_ACCOUNT_SID = "YOUR_TWILIO_ACCOUNT_SID";
var TWILIO_AUTH_TOKEN = "YOUR_TWILIO_AUTH_TOKEN";
var TWILIO_WHATSAPP_FROM = "YOUR_TWILIO_WHATSAPP_NUMBER"; // e.g. "+14155238886", no "whatsapp:" prefix

var WHATSAPP_ATTACH_PDF = true;
// ===================================================================

var LAST_ROW_PROPERTY = "LAST_PROCESSED_FORM_ROW";

/**
 * Run this ONCE manually (see setup instructions above) to install the
 * "On form submit" trigger. Safe to re-run — it removes any existing
 * onFormSubmit trigger first so duplicates are never created.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "onFormSubmit") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("onFormSubmit")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log("Form-submit trigger installed. New Google Form responses will now be handled automatically.");
}

/**
 * PATH A — fires automatically for every new Google Form response, once
 * setup() has been run. No manual action needed after that.
 *
 * Reads answers by matching each question's exact column HEADER (not
 * e.namedValues) — resilient to column order, and correctly handles the
 * case where "Collect email addresses" is enabled on the Form (which
 * inserts its own auto "Email Address" column): when a header appears
 * more than once, the LAST matching column is used, since the Form's own
 * custom "Email Address" question comes after the auto-collected one.
 */
function onFormSubmit(e) {
  var row = e.range.getRow();

  // ---- Duplicate guard: skip if this row was already processed. ----
  var props = PropertiesService.getScriptProperties();
  var lastRow = Number(props.getProperty(LAST_ROW_PROPERTY) || 0);
  if (row <= lastRow) {
    logError_("Row " + row + " already processed — skipping duplicate trigger run.");
    return;
  }

  var sheet = e.range.getSheet();
  var data = extractFormLeadData_(sheet, e);
  var timestamp = new Date();

  processLead_(data, timestamp, "Google Form", "New Lead Received from Google Form");

  // Mark as processed only after attempting the pipeline, so an error
  // earlier on doesn't silently mark a row as done before it's handled.
  props.setProperty(LAST_ROW_PROPERTY, String(row));
}

function extractFormLeadData_(sheet, e) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowValues = e.values; // positional answers for the submitted row, timestamp first

  function lastColumnFor(headerName) {
    var idx = -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === headerName) idx = i;
    }
    return idx;
  }
  function valueFor(headerName) {
    var idx = lastColumnFor(headerName);
    return idx === -1 ? "" : (rowValues[idx] || "");
  }

  return {
    name: valueFor("Name"),
    mobile: valueFor("Mobile Number"),
    email: valueFor("Email Address"),
    company: valueFor("Company Name (optional)"),
    service: valueFor("Service Required"),
    message: valueFor("Message")
  };
}

/**
 * PATH B — the website's own contact form POSTs here directly
 * (unchanged from the existing Web App deployment).
 */
function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateWebsiteSheet_(ss);
  var data = JSON.parse(e.postData.contents);
  var timestamp = new Date();

  sheet.appendRow([
    timestamp,
    data.name || "",
    data.mobile || "",
    data.email || "",
    data.company || "",
    data.service || "",
    data.message || ""
  ]);

  processLead_(data, timestamp, "King Creation Website", "New Lead — King Creation Website");

  return ContentService.createTextOutput(JSON.stringify({ status: "success" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Shared pipeline for both paths: PDF, xlsx snapshot, WhatsApp, email.
 * Each step is independently best-effort — a failure in one never blocks
 * the others, and none of them can undo the already-saved lead row.
 */
function processLead_(data, timestamp, sourceLabel, emailSubject) {
  var waMessage = buildWhatsAppMessage_(data, timestamp, sourceLabel);
  var emailBody = buildEmailBody_(data, timestamp);

  var xlsxBlob = null;
  try {
    xlsxBlob = updateXlsxSnapshot_();
  } catch (err) {
    logError_("XLSX export failed: " + err);
  }

  var pdfFile = null;
  try {
    pdfFile = generateLeadPdf_(data, timestamp);
  } catch (err) {
    logError_("PDF generation failed: " + err);
  }

  try {
    sendEmailNotification_(emailSubject, emailBody, pdfFile, xlsxBlob);
  } catch (err) {
    logError_("Email notification failed: " + err);
  }

  try {
    sendWhatsAppNotification_(waMessage, pdfFile);
  } catch (err) {
    logError_("WhatsApp notification failed: " + err);
  }
}

function getOrCreateWebsiteSheet_(ss) {
  var sheet = ss.getSheetByName(WEBSITE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(WEBSITE_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Date & Time", "Name", "Phone Number", "Email Address", "Company", "Service", "Message"]);
    sheet.getRange(1, 1, 1, 7).setFontWeight("bold");
  }
  return sheet;
}

function formatTimestamp_(timestamp) {
  return Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "dd MMM yyyy, hh:mm a");
}

/**
 * WhatsApp message — exact requested format:
 * 📩 New Lead Received
 *
 * Name: ...
 * Phone: ...
 * Email: ...
 * Service: ...
 * Message: ...
 * Date & Time: ...
 *
 * Submitted via <source>.
 */
function buildWhatsAppMessage_(data, timestamp, sourceLabel) {
  return "📩 New Lead Received\n\n" +
    "Name: " + (data.name || "-") + "\n" +
    "Phone: " + (data.mobile || "-") + "\n" +
    "Email: " + (data.email || "-") + "\n" +
    "Service: " + (data.service || "-") + "\n" +
    "Message: " + (data.message || "-") + "\n" +
    "Date & Time: " + formatTimestamp_(timestamp) + "\n\n" +
    "Submitted via " + sourceLabel + ".";
}

/**
 * Email body — exact requested format:
 * A new lead has been received through the Google Form.
 *
 * Name: ...
 * Phone: ...
 * Email: ...
 * Service: ...
 * Message: ...
 * Date & Time: ...
 *
 * Please contact the customer as soon as possible.
 */
function buildEmailBody_(data, timestamp) {
  return "A new lead has been received.\n\n" +
    "Name: " + (data.name || "-") + "\n" +
    "Phone: " + (data.mobile || "-") + "\n" +
    "Email: " + (data.email || "-") + "\n" +
    "Service: " + (data.service || "-") + "\n" +
    "Message: " + (data.message || "-") + "\n" +
    "Date & Time: " + formatTimestamp_(timestamp) + "\n\n" +
    "Please contact the customer as soon as possible.";
}

/**
 * Emails the lead notification using MailApp — no SMTP credentials
 * needed, sends from the Google account the script runs as. Attaches
 * the per-lead PDF and the current .xlsx snapshot when available.
 */
function sendEmailNotification_(subject, body, pdfFile, xlsxBlob) {
  var attachments = [];
  if (pdfFile) {
    attachments.push(pdfFile.getAs("application/pdf"));
  }
  if (xlsxBlob) {
    attachments.push(xlsxBlob);
  }

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: subject,
    body: body,
    attachments: attachments
  });
}

/**
 * Sends the lead message to WhatsApp via the Twilio WhatsApp API.
 * If WHATSAPP_ATTACH_PDF is true and a PDF was generated, includes it as
 * a media attachment (requires the PDF's Drive sharing to be
 * link-viewable, which generateLeadPdf_ already sets).
 */
function sendWhatsAppNotification_(message, pdfFile) {
  if (TWILIO_ACCOUNT_SID.indexOf("YOUR_") === 0) {
    logError_("WhatsApp skipped: Twilio credentials not configured.");
    return;
  }

  var url = "https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_ACCOUNT_SID + "/Messages.json";
  var payload = {
    From: "whatsapp:" + TWILIO_WHATSAPP_FROM,
    To: "whatsapp:" + NOTIFY_WHATSAPP_TO,
    Body: message
  };

  if (WHATSAPP_ATTACH_PDF && pdfFile) {
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
 * as a Blob (for email attachment), and keeps a single up-to-date copy
 * of it in Google Drive (replacing the previous version so it never
 * accumulates duplicates).
 */
function updateXlsxSnapshot_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var token = ScriptApp.getOAuthToken();
  var exportUrl = "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/export?format=xlsx";

  var response = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: "Bearer " + token }
  });
  var blob = response.getBlob().setName(XLSX_FILE_NAME);

  var existing = DriveApp.getFilesByName(XLSX_FILE_NAME);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }

  DriveApp.createFile(blob);
  return blob;
}

/**
 * Builds a one-page PDF summary for a single lead by writing to a
 * temporary Google Doc, exporting it as PDF, then discarding the temp
 * Doc (only the PDF file remains in Drive). Returns the Drive File
 * object for the PDF.
 */
function generateLeadPdf_(data, timestamp) {
  var tempDocName = "temp-lead-" + timestamp.getTime();
  var doc = DocumentApp.create(tempDocName);
  var body = doc.getBody();

  body.appendParagraph("King Creation — New Lead").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("Submitted: " + formatTimestamp_(timestamp));
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
  pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

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
