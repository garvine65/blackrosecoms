# Black Rose Consultancy — Performance Evaluation Sheet

A single-page evaluation form for three named directors (Wangui Muchiri,
Mercy Waweru, Diane Meria) to rate a Senior Oversight Accountant on five
metrics plus an overall score, with free-text fields for strengths, areas
for improvement, and additional comments.

## Serverless PDF & WhatsApp Delivery Workflow

This application runs 100% serverless in the user's browser with **zero backend costs**.

1. **Director Selection**: Evaluator selects their name (`Wangui Muchiri`, `Mercy Waweru`, or `Diane Meria`).
2. **Form Completion**: Ratings and narrative comments are saved locally in the director's browser (`localStorage`) so drafts are never lost.
3. **PDF Export**: Clicking **"Generate PDF & Send via WhatsApp"** uses `html2pdf.js` to create a publication-ready evaluation document featuring Black Rose Consultancy branding, star scores, narrative boxes, and a signature line.
4. **WhatsApp Dispatch**: Automatically downloads the PDF file (e.g. `BlackRose_Evaluation_Wangui_Muchiri_2026-08-25.pdf`) and opens WhatsApp with a pre-formatted message so the director can attach and send their report directly to management/HR.

## Files

- `index.html` — markup & printable PDF layout template
- `styles.css` — dark/gold luxury theme & light-mode PDF styling
- `script.js` — form logic, star ratings, local draft storage, html2pdf rendering, and WhatsApp link handler
- `logo.png` — company logo, used on header and PDF export

## Running it locally

No build step. Just open `index.html` in a browser, or serve the folder with any static server:

```bash
npx serve .
```

## Customizing

- **Director names / roles**: edit the `DIRECTORS` array in `script.js`.
- **Metrics**: edit the `METRICS` array in `script.js`.
- **Recipient WhatsApp number**: directors can type a recipient number directly on screen, or you can set a default in `index.html` / `script.js`.
- **Colors**: defined in `:root` in `styles.css` (web app theme) and `.pdf-container` (printable PDF theme).

