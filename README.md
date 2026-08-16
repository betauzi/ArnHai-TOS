# Arn-Hai ToS

A Chrome extension that summarizes Terms of Service and Privacy Policy pages, evaluates potential risk, and flags common online-scam signals. The extension supports local analysis and optional AI providers configured by each user.

## Features

- Detect Terms of Service and Privacy Policy pages.
- Summarize content and assign a risk score with highlighted clauses.
- Flag common investment, romance, phishing, job, crypto, and impersonation scam signals.
- Analyze suspicious URLs and page structure.
- Export analysis results and use the popup for follow-up questions.

## Technology

- Chrome Extension Manifest V3
- Vanilla JavaScript, HTML, and CSS
- Rule-based risk and scam detection
- Optional Google Gemini, OpenRouter, Ollama, and local-model integrations

## Requirements

- Google Chrome or another Chromium-based browser
- Developer mode enabled in the extensions page
- An API key only when using an external AI provider

## Getting Started

```bash
git clone https://github.com/betauzi/ArnHai-TOS.git
```

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose the cloned `ArnHai-TOS` folder.
5. Open the extension settings and configure an AI provider only if needed.

## Available Commands

This project has no build step. Load the repository directory directly as an unpacked extension. After changing source files, use the Reload button on `chrome://extensions/`.

## Configuration

API keys are entered by the user through the extension settings and are stored in Chrome extension storage. They are not supplied through repository files. Use a separate, restricted key for local testing and revoke it immediately if it is exposed.

## Project Structure

```text
background/           Service worker and provider requests
content/              Page detection, highlights, and warnings
options/              Extension settings page
popup/                Popup user interface
risk-engine/          ToS risk analysis
scam-detector/        Scam-signal analysis
vendor/               Third-party browser assets
manifest.json         Extension manifest
```

## Security Notes

The extension sends API credentials in request headers, never in URLs. Review permissions and host permissions before publishing. Do not commit API keys, browser profiles, exported storage, or private model credentials.

## License

No license has been declared for this repository. Add a `LICENSE` file before distributing or accepting external contributions.
