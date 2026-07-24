# Backend Integration — Excel/PDF Storage, WhatsApp & Email Notifications

This connects the **existing** King Creation contact form (design/layout unchanged — Email, Company, and Message fields were added earlier so the notifications have something to send) to:

1. A live Google Sheet that doubles as an auto-exported **.xlsx** file
2. A one-page **PDF** generated per lead
3. A **WhatsApp** notification to **+91 6383833445** via Twilio (includes the PDF as a media attachment)
4. An **email** notification to **kingcreation2k7@gmail.com** (with the PDF and the latest .xlsx snapshot attached)

Everything runs from **`Code.gs`** (included in this repo) as a single Google Apps Script — no separate server needed, so it works with your current static hosting (GitHub Pages / Netlify).

**Reliability rule built into the script:** the lead is saved to the sheet *first*, before PDF generation or either notification runs. PDF generation, email, and WhatsApp are each wrapped in their own `try/catch`, so if any one of them fails, the lead is still saved and the others still attempt to run.

**Also on the site itself:** next to the Submit button there are now **"Send via WhatsApp"** and **"Send via Email"** quick buttons. These open a pre-filled WhatsApp chat or email draft with the visitor's entered details immediately (no backend dependency — works instantly), while also saving the lead through the same backend as a normal Submit.

---

## Step 1 — Get the Google Sheet

You have a Google Form at `https://forms.gle/WaBVJnTT5Wp8TKz39` — reuse its linked response Sheet so your Form submissions and website leads live in one file:

1. Open the Form in **edit mode** (you must be signed in as the owner — the `forms.gle` link alone opens the public fill-in view, not the editor. Find it in your Google Drive or Forms list instead).
2. Go to the **Responses** tab.
3. Click the green **Sheets icon** (top right of that tab) → **Create spreadsheet** (or **View responses in Sheets** if one already exists).
4. This opens/creates the linked Google Sheet. Keep that tab open — you'll add the script to it next.

`Code.gs` automatically creates its own **`Leads`** tab inside that spreadsheet the first time it runs, with headers `Date & Time | Name | Phone Number | Email Address | Company | Service | Message` — it won't touch the Form's own `Form Responses 1` tab, so both stay separate within the same file.

*(No existing Form? Just go to sheets.google.com → create a new blank spreadsheet instead, and skip straight to Step 2.)*

## Step 2 — Add the script

1. In that Sheet: **Extensions → Apps Script**.
2. Delete the placeholder `Code.gs` content.
3. Open `Code.gs` from this repo, copy its entire contents, and paste it into the Apps Script editor.

## Step 3 — Get Twilio WhatsApp credentials

1. Sign up at twilio.com (free trial credit available; WhatsApp sends are paid after that).
2. In the Twilio Console, note your **Account SID** and **Auth Token**.
3. Go to **Messaging → Try it out → Send a WhatsApp message** to activate the Twilio WhatsApp Sandbox, and follow the steps to join the sandbox from **+91 6383833445** (send the given join code to Twilio's sandbox number on WhatsApp once — required for the sandbox to deliver to that number).
4. Note the sandbox WhatsApp number (usually `+14155238886`).
5. For production use (no sandbox limits), apply for an approved Twilio WhatsApp Sender through Meta — Twilio walks you through this separately.

## Step 4 — Fill in the CONFIG block

At the top of `Code.gs` (now pasted into Apps Script), fill in:

```javascript
var TWILIO_ACCOUNT_SID = "YOUR_TWILIO_ACCOUNT_SID";
var TWILIO_AUTH_TOKEN = "YOUR_TWILIO_AUTH_TOKEN";
var TWILIO_WHATSAPP_FROM = "YOUR_TWILIO_WHATSAPP_NUMBER"; // e.g. "+14155238886", no "whatsapp:" prefix
```

`NOTIFY_EMAIL` and `NOTIFY_WHATSAPP_TO` are already set to `kingcreation2k7@gmail.com` and `+916383833445` — change only if those should be different.

## Step 5 — Deploy

1. Click **Deploy → New deployment**.
2. Type: **Web app**.
3. Execute as: **Me**. Who has access: **Anyone**.
4. Click **Deploy**, and authorize the permissions it requests (Sheets, Gmail, Drive, and external requests to Twilio — all required for this flow).
5. Copy the Web App URL it gives you.

## Step 6 — Connect it to the website

Open `index.html`, find:

```javascript
var GOOGLE_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
```

Replace the placeholder with the URL from Step 5. Save, commit, push.

---

## What happens on submit

1. Visitor fills the existing form (Name, Mobile, Email, Company, Service, Message) and clicks **Submit** — or taps **Send via WhatsApp** / **Send via Email**, which open a pre-filled message immediately and also trigger the same backend save.
2. The lead is saved as a new row in the `Leads` sheet — this always happens first, before anything else.
3. The sheet is exported as an up-to-date `King_Creation_Leads.xlsx` snapshot in your Google Drive (previous snapshot is replaced, so it never piles up duplicates).
4. A one-page PDF summary of that specific lead is generated and saved to Drive (shared as view-only via link, so Twilio can fetch it).
5. An email is sent to `kingcreation2k7@gmail.com` with the lead details in the body, **plus the lead PDF and the current .xlsx snapshot attached**.
6. A WhatsApp message is sent to `+91 6383833445` via Twilio with the same details, **plus the lead PDF as a media attachment** (when `WHATSAPP_ATTACH_PDF` is `true`).
7. The visitor sees: **"Thank you! Your inquiry has been submitted successfully. We will contact you shortly."**
8. If Twilio, Gmail, or PDF generation fails for any reason, the lead is still safely in the sheet/xlsx — nothing is lost.

## Notes & limits

- Because the site calls the script with `mode: 'no-cors'` (required for a static site to POST to Apps Script without CORS errors), the browser can't read the actual success/failure response — the visitor always sees the success message once the request is sent. The real guarantee (lead never lost even if notifications fail) is enforced **inside** the script, as shown above.
- Twilio's WhatsApp **sandbox** only delivers to numbers that joined the sandbox (Step 3.3) and its sessions expire periodically — fine for testing/internal alerts to your own number, but apply for a production WhatsApp sender before relying on this for anything customer-facing.
- **Media messages (the PDF via WhatsApp)** require the recipient's Twilio setup to support media — this works in the sandbox for most accounts, but confirm once you move to a production sender. If you'd rather keep WhatsApp alerts text-only, set `WHATSAPP_ATTACH_PDF = false` in `Code.gs` (the email will still get the PDF either way).
- The PDF is generated by briefly creating a temporary Google Doc, exporting it as PDF, then deleting the temp Doc — this needs the Google Docs permission, which the authorization step in Step 5 will prompt for.
- If `TWILIO_ACCOUNT_SID` is left as the placeholder, the script skips the WhatsApp step silently (logged, not thrown) rather than failing the whole request — so the site keeps working even before Twilio is configured.
- The exported `.xlsx` file and per-lead PDFs live in the Drive account that owns the Apps Script — share that Drive folder with anyone else on your team who needs the files.
