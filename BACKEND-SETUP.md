# Automated Lead Management — Google Form + Website, WhatsApp, Email, Excel/PDF

> **The website's contact form now also submits to Formspree** (`https://formspree.io/f/mdaqpjbl`) directly from the browser — no setup needed, it's already working. Formspree emails the raw submission wherever your Formspree account is configured to send it. Everything below (Google Sheet, PDF, xlsx, WhatsApp, the specific email template) is a *separate, optional* layer on top — the site works for basic lead capture even if you never touch `Code.gs`. The two run independently and don't affect each other.

This is one shared backend (`Code.gs`) handling leads from **two sources**:

- **A) Your Google Form** — https://docs.google.com/forms/d/e/1FAIpQLSdD2fkQV-PkUFWPDd2E6QeXSa3r92O02YEzM9HE4NERk1IoDQ/viewform
  Monitored automatically via an installable trigger — fires for every new response with zero manual steps after the one-time setup below.
- **B) The website's own contact form** — unchanged design, still posts to the same script as a Web App (as set up earlier) *and* to Formspree.

For every new lead, from either source:

1. The lead is saved first (Google Forms saves it automatically for source A; the script saves it for source B) — **before** any notification is attempted, and never undone if a notification fails.
2. A one-page **PDF** summary of the lead is generated.
3. The response sheet is exported as an up-to-date **`King_Creation_Leads.xlsx`** snapshot in Google Drive.
4. A **WhatsApp** message is sent to **+91 6383833445** via Twilio (with the PDF attached).
5. An **email** is sent to **kingcreation2k7@gmail.com** (with the PDF and the .xlsx snapshot attached).

Steps 2–5 each run in their own `try/catch` — a failure in any one of them never blocks the save or the other steps.

**Duplicate protection:** installable form triggers can occasionally re-fire on the same response if a run times out and Apps Script retries it. `onFormSubmit()` tracks the last-processed row in Script Properties and skips anything already handled, so notifications are never sent twice for the same submission.

---

## Step 1 — Open the Form's response Sheet

1. Open the Form in **edit mode**, signed in as the owner (Google Drive → your Forms list — the public `viewform` link itself won't get you to the editor).
2. **Responses** tab → click the green **Sheets icon** → **Create spreadsheet** (or **View responses in Sheets** if one already exists).
3. Keep that spreadsheet open — the script attaches here.

## Step 2 — Add the script

1. In that Sheet: **Extensions → Apps Script**.
2. Delete any placeholder content.
3. Open `Code.gs` from this repo, copy its entire contents, and paste it into the Apps Script editor.

## Step 3 — Get Twilio WhatsApp credentials

1. Sign up at twilio.com (free trial credit available; WhatsApp sends are paid after that).
2. In the Twilio Console, note your **Account SID** and **Auth Token**.
3. **Messaging → Try it out → Send a WhatsApp message** to activate the Twilio Sandbox, and join it from **+91 6383833445** by sending the given join code to Twilio's sandbox number on WhatsApp once.
4. Note the sandbox WhatsApp number (usually `+14155238886`).
5. For production use (no sandbox limits), apply for an approved Twilio WhatsApp Sender through Meta — a separate step Twilio walks you through.

## Step 4 — Fill in the CONFIG block

At the top of `Code.gs`, fill in:

```javascript
var TWILIO_ACCOUNT_SID = "YOUR_TWILIO_ACCOUNT_SID";
var TWILIO_AUTH_TOKEN = "YOUR_TWILIO_AUTH_TOKEN";
var TWILIO_WHATSAPP_FROM = "YOUR_TWILIO_WHATSAPP_NUMBER"; // e.g. "+14155238886", no "whatsapp:" prefix
```

`NOTIFY_EMAIL` and `NOTIFY_WHATSAPP_TO` are already set correctly. The `Q_NAME`, `Q_MOBILE`, etc. constants already match your Form's current question titles exactly — only change them if you rename a question on the Form itself.

## Step 5 — Run `setup()` once (this is the "no manual intervention after this" step)

1. In the Apps Script editor toolbar, select **`setup`** from the function dropdown (next to the Run button).
2. Click **Run**.
3. Authorize the permissions it requests (Sheets, Drive, Docs, Gmail, external requests to Twilio).
4. Done — this installs the "On form submit" trigger. Every future Google Form response now fires the full workflow automatically, forever, with no further action needed. Safe to re-run `setup()` any time (e.g. after editing the script) — it won't create duplicate triggers.

## Step 6 — (For the website's own form) Deploy as a Web App

1. **Deploy → New deployment → Web app**.
2. Execute as: **Me**. Who has access: **Anyone**.
3. Deploy, copy the Web App URL.
4. In `index.html`, replace:
   ```javascript
   var GOOGLE_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
   ```
   with that URL. Save, commit, push.

---

## Message formats

**WhatsApp:**
```
📩 New Lead Received

Name: {{Name}}
Phone: {{Phone}}
Email: {{Email}}
Service: {{Service}}
Message: {{Message}}
Date & Time: {{Timestamp}}

Submitted via Google Form.
```
(Reads "Submitted via King Creation Website." for source B, so you can always tell where a lead came from.)

**Email subject:** `New Lead Received from Google Form` (source A) or `New Lead — King Creation Website` (source B)

**Email body:**
```
A new lead has been received.

Name: {{Name}}
Phone: {{Phone}}
Email: {{Email}}
Service: {{Service}}
Message: {{Message}}
Date & Time: {{Timestamp}}

Please contact the customer as soon as possible.
```

## Two things worth fixing on the Form itself

1. **"Collect email addresses"** — if this is turned on (Form → Settings → Responses), it adds a built-in email question that requires the respondent to be signed into Google. It doesn't block this trigger-based automation (which reacts to responses however they arrive), but it's redundant with your own "Email Address" question and can confuse respondents who aren't signed in — worth turning off.
2. **"Editng" typo** in the Service Required options — should read "Editing" to match the website's dropdown value exactly.

## Notes & limits

- Twilio's WhatsApp **sandbox** only delivers to numbers that joined the sandbox and its sessions expire periodically — fine for internal alerts to your own number, but apply for a production sender before relying on this for anything customer-facing.
- **Media messages (the PDF via WhatsApp)** need the recipient's Twilio setup to support media — works in sandbox for most accounts. Set `WHATSAPP_ATTACH_PDF = false` in `Code.gs` to keep WhatsApp text-only (email still gets the PDF either way).
- If `TWILIO_ACCOUNT_SID` is left as the placeholder, the script skips the WhatsApp step silently (logged, not thrown) — everything else still works.
- The exported `.xlsx` file and per-lead PDFs live in the Drive account that owns the Apps Script — share that Drive folder with your team as needed.
- The website's quick **"Send via WhatsApp"** / **"Send via Email"** buttons (next to Submit) still work exactly as before — they open a pre-filled message instantly and also save the lead through this same backend.
