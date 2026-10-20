# Security Policy

## Supported Versions

We provide security and bug updates for the following versions:

| Version | Supported          |
| :---    | :---               |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability within **Sims 4 CC Manager**, please do **not** disclose it in a public issue.

Instead, please report security vulnerabilities by either:
1. Opening a private **Security Advisory** on GitHub: [Report a vulnerability](https://github.com/268268268/sims4cc/security/advisories/new)
2. Or sending an email to [pozi268test@gmail.com](mailto:pozi268test@gmail.com) with the subject `[SECURITY] Sims 4 CC Manager`.

Please include:
* Description of the vulnerability.
* Steps or proof-of-concept required to reproduce the issue.
* Potential impact.

We will review your report within 48 hours and work with you on a resolution before any public release.

---

## Binary Integrity & Antivirus Scans (VirusTotal)

### Open Source Transparency
Sims 4 CC Manager is 100% open-source. All code for both the Go backend and React frontend is available in this repository for inspection and independent building.

### Automated VirusTotal Scanning
Every official release asset is scanned with **[VirusTotal](https://www.virustotal.com/)** using 70+ antivirus engines. Scan reports are automatically appended to each GitHub Release.

### Note on Heuristic False Positives
Because this is a free, open-source project without an expensive Extended Validation (EV) code-signing certificate:
* Windows SmartScreen may show an *"Unknown Publisher"* warning on first launch. Click **More info -> Run anyway**.
* A few antivirus engines may flag freshly compiled Go/Wails binaries under generic heuristic signatures (such as `Heur.Generic`, `Trojan.Generic`, or `Win32.Evo-gen`).

If you wish to independently verify your binary:
1. Compute the SHA-256 hash in PowerShell:
   ```powershell
   Get-FileHash sims4-cc-manager.exe -Algorithm SHA256
   ```
2. Upload the file or search its hash on [VirusTotal](https://www.virustotal.com/).
3. Compare the hash against the checksum published in the official GitHub Release notes.
