# Contributing to Sims 4 CC Manager

Thank you for your interest in contributing to **Sims 4 CC Manager**! 🎉

Whether you are fixing a bug, proposing a new feature, adding a translation, or improving documentation, your contributions are welcome.

Please take a moment to review these guidelines before getting started.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behavior to [pozi268test@gmail.com](mailto:pozi268test@gmail.com).

---

## How Can I Contribute?

### 1. Reporting Bugs

Before creating a bug report, please check existing [Issues](https://github.com/268268268/sims4cc/issues) to ensure the problem has not already been reported.

When opening an issue, use our **Bug Report** template and include:
* A clear, descriptive title.
* Step-by-step reproduction instructions.
* Expected behavior vs. actual behavior.
* Relevant log snippets or screenshots.
* Your environment details:
  * Windows version (10 / 11)
  * Sims 4 version / platform (EA App, Steam, etc.)
  * Sims 4 CC Manager version

### 2. Suggesting Enhancements

Feature suggestions are welcome! Please open an issue using the **Feature Request** template and explain:
* The problem you want to solve or the feature you envision.
* Why this would be beneficial to users of Sims 4 CC Manager.
* Any alternative workflows or solutions you have considered.

### 3. Submitting Code Changes

1. **Fork the repository** to your own GitHub account.
2. **Clone your fork**:
   ```bash
   git clone https://github.com/<your-username>/sims4cc.git
   cd sims4cc
   ```
3. **Create a new branch** with a descriptive name:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```
4. **Develop and test** your changes locally (see [Development Setup](#development-setup)).
5. **Commit your changes** following conventional commit messages (`feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`).
6. **Push to your fork** and open a **Pull Request** against `master`.

---

## Development Setup

### Prerequisites

* **Go**: version 1.22 or higher ([Download Go](https://go.dev/dl/))
* **Node.js**: version 18 or higher & npm ([Download Node.js](https://nodejs.org/))
* **Wails CLI v2**:
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```

### Running Locally in Development Mode

1. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

2. Start the Wails live-development environment:
   ```bash
   wails dev
   ```
   This will spin up a Go backend with live reloading and a Vite dev server for the React UI.

### Building a Release Binary

```bash
wails build
```

The compiled binary will be placed in `build/bin/sims4-cc-manager.exe`.

---

## Project Structure

```
sims4cc/
├── backend/            # Go backend packages (DBPF parser, downloader, scanner, cache)
├── frontend/           # React 18 frontend (Vite, Tailwind CSS, Three.js 3D viewer)
│   ├── src/
│   │   ├── components/ # Reusable UI components
│   │   ├── hooks/      # Custom React hooks
│   │   └── i18n/       # Localization strings (EN, RU)
│   └── index.html
├── build/              # Application icons, manifest, Windows assets
├── docs/               # Screenshots and documentation assets
├── app.go              # Wails application bindings
├── main.go             # Application entrypoint
└── wails.json          # Wails v2 project configuration
```

---

## Style Guidelines

* **Go**: Follow standard Go formatting (`gofmt`) and idioms. Check for warnings with `go vet ./...`.
* **Frontend**: Follow modern React functional components with TypeScript/JSX best practices. Ensure clean Tailwind class usage adhering to the Studio Titanium design language.
* **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/):
  * `feat:` A new feature
  * `fix:` A bug fix
  * `docs:` Documentation updates
  * `style:` Code style / formatting changes (no logic change)
  * `refactor:` Code refactoring without behavior changes
  * `perf:` Performance improvements
  * `test:` Adding or updating tests

---

## Pull Request Checklist

Before submitting your PR, please verify:
- [ ] Code compiles without errors (`wails build` or `go build`).
- [ ] Frontend builds cleanly (`cd frontend && npm run build`).
- [ ] New or modified code follows project architecture and conventions.
- [ ] Commit history is clean and descriptive.
- [ ] Documentation has been updated where relevant.

Thank you for helping make Sims 4 CC Manager better!
