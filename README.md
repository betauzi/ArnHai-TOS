# Arn-Hai ToS

A Chrome extension that analyzes Terms of Service and Privacy Policy pages, assigns a risk score, and flags common online-scam signals. It supports Google Gemini for AI analysis and an optional local FastAPI classifier.

## Features

- Detect Terms of Service and Privacy Policy pages.
- Summarize content and assign a risk score with highlighted clauses.
- Flag common investment, romance, phishing, job, crypto, and impersonation scam signals.
- Analyze suspicious URLs and page structure.
- Run an optional local FastAPI classifier for clause analysis.

## Technology

- Chrome Extension Manifest V3
- Vanilla JavaScript, HTML, and CSS
- Google Gemini API
- FastAPI, PyTorch, and Hugging Face Transformers
- Rule-based risk and scam detection

## Requirements

- Google Chrome or another Chromium-based browser
- Developer mode enabled in the extensions page
- A Gemini API key when using Gemini analysis
- Python 3.10 or later for the optional local classifier

## Getting Started

```bash
git clone https://github.com/betauzi/ArnHai-TOS.git
```

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Select Load unpacked.
4. Choose the cloned `ArnHai-TOS` folder.
5. Open extension settings and enter a Gemini API key, or configure the local classifier.

## Available Commands

The extension has no build step. After changing source files, use the Reload button on `chrome://extensions/`.

To start the optional local classifier:

```bash
cd fastapi_server
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

Enable FastAPI in extension settings and use `http://127.0.0.1:8000/classify` as the classifier URL.

## Configuration

API keys are entered through extension settings and stored in Chrome extension storage. The Gemini key is sent in the `x-goog-api-key` request header, not in URLs. Use a restricted key for local testing and revoke it immediately if it is exposed.

## Project Structure

```text
background/           Service worker and Gemini/FastAPI integration
content/              Page detection, highlights, and warnings
fastapi_server/       Optional local text-classification service
options/              Extension settings page
popup/                Popup user interface
risk-engine/          ToS risk analysis
scam-detector/        Scam-signal analysis
vendor/               Third-party browser assets
manifest.json         Extension manifest
```

## Security Notes

Review the extension's broad host permission before publishing. Do not commit API keys, browser profiles, exported Chrome storage, virtual environments, or FastAPI credentials. The local classifier downloads its model when it first starts.

## License

No license has been declared for this repository. Add a `LICENSE` file before distributing or accepting external contributions.
