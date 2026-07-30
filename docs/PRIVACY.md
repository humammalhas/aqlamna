# Privacy Policy — Aqlamna

**Version 1.0 — 30 July 2026**

Aqlamna is an open-source tool for writing interactive branching stories in Arabic. It is owned by Al-Maseer for Software & Computer Systems LLC, registered in Jordan.

This policy explains what we collect about you. The short answer: nothing.

---

## No accounts, no sign-up

We do not ask for an email address, password, or any personal information. There is no login of any kind.

## No server of our own

The editor is a static site. There is no backend, no database, and no server-side storage. Your stories never reach us because they never leave your device.

## Your stories stay on your device

Stories are stored in the browser (IndexedDB) on your own device. Clearing your browser data deletes them. We hold no copy.

## No tracking, no ads

We use no tracking cookies, no analytics, no third-party trackers, and no advertising.

## AI features

AI features are optional and off by default. The author supplies their own API key ("bring your own key") and chooses their provider.

When — and only when — the author presses an AI button, the following is sent to the provider they selected:

- A system prompt containing Arabic writing rules
- The text of the story being written
- The names of passages and variables in that story

Nothing is sent to Al-Maseer. Nothing is sent when the AI buttons are not used.

### Supported providers

DeepSeek, OpenAI, Groq, Together AI, Mistral, Venice, OpenRouter, Anthropic, Google Gemini, Ollama, LM Studio, and any custom OpenAI-compatible endpoint.

Once text reaches a provider, that provider's own privacy policy governs it. Read it before using their service.

**Most private option:** Ollama and LM Studio run on your own computer. Choosing them means no story text leaves your device at all.

### API key storage

The key is stored in the browser's localStorage, per provider. The key is NOT protected by encryption — a web page cannot encrypt it meaningfully. The key is sent only to the provider you selected, never to us.

## Service worker

A service worker caches application files so the editor works offline. It never caches AI requests or responses.

## Exported story files

An exported story file (HTML) contains no tracking and makes no network requests. A reader who opens one sends data to nobody.

## Hosting

The site is hosted on Cloudflare Pages. Like any web host, Cloudflare processes standard technical request data — IP address, browser type, timestamps — to serve the site and protect against abuse.

## Children

Aqlamna collects no personal data from anyone, including children. There are no classroom or student-tracking features. If a teacher uses Aqlamna with pupils, no pupil data reaches us or is stored by the software.

## Contact

admin@almaseer.co

## Governing law

This policy is governed by the laws of the Hashemite Kingdom of Jordan.

---

> This document is not legal advice. It should be reviewed by a qualified lawyer before Aqlamna adds user accounts, payments, or any feature that stores data about students.
