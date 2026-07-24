# King Creation — Business Website

A premium, single-page business website for **King Creation**, a digital services studio offering Web Development, App Development, Graphic Design, and Photo & Video Editing.

Black / gold / ivory theme, crown branding, fully responsive (mobile, tablet, desktop), smooth scroll animations, and a working contact form (once connected — see below).

## Files

| File | Purpose |
|---|---|
| `index.html` | The entire website — HTML, CSS, and JS in one file |
| `robots.txt` | Search engine crawl rules |
| `sitemap.xml` | Sitemap for search engines |
| `og-image.jpg` | Social share preview image (shows when the site is shared on WhatsApp/Facebook/Instagram) |

## Deploy with GitHub Pages

1. Push these files to the **root** of this repository (already done if you're reading this here).
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`, then **Save**.
4. GitHub will give you a live URL, e.g. `https://<your-username>.github.io/<repo-name>/`.

## Before going live — 1 thing to finish

1. **Connect the contact form to Google Sheets.**
   Open `index.html`, search for `GOOGLE_SCRIPT_URL` near the bottom of the `<script>` tag. Full setup steps are in the comment right above it:
   - Create a Google Sheet with header row `Name | Mobile Number | Service Required | Date`
   - In the Sheet: **Extensions → Apps Script**, paste the provided script
   - **Deploy → New deployment → Web app**, access set to "Anyone"
   - Paste the resulting URL into `GOOGLE_SCRIPT_URL`

## Update the domain

`index.html`, `robots.txt`, and `sitemap.xml` all reference `https://kingcreation.netlify.app/`. If you deploy somewhere else (like GitHub Pages), replace that URL throughout with your real live URL.

## Contact

- Phone / WhatsApp: +91 6383833445
- Email: kingcreation2k7@gmail.com
