# Contributing to Whisk 🐱

First off, thanks for taking the time to contribute! It's people like you who make the open-source community such an amazing place to learn, inspire, and create.

## 🛠️ Tech Stack

- **Runtime:** Bun
- **Frontend:** React + Vite + Tailwind CSS (deployed on Cloudflare Pages)
- **Backend:** Hono (deployed on Cloudflare Workers)
- **Storage:** Cloudflare R2 & D1
- **State Management:** Durable Objects

## 🚀 Getting Started

### 1. Fork & Clone

Fork the repo and clone it locally.

### 2. Install Dependencies

Install dependencies using Bun:

```bash
bun install
```

### 3. Environment Setup

Copy `.dev.vars.example` to `backend/.dev.vars` and add your local keys.

### 4. Run Development Servers

```bash
bun run dev  # Starts both frontend and backend
```

## 📜 Contribution Rules

### Branching Model

We follow a strict Pull Request workflow. Do not push directly to `main`.

- Create a feature branch: `git checkout -b feat/your-feature-name`
- Open a PR targeting the `main` branch

### Commit Messages

We use Conventional Commits:

- `feat: ...` for new features
- `fix: ...` for bug fixes
- `docs: ...` for documentation changes
- `refactor: ...` for code cleanup

### Code Style

- Use TypeScript for everything
- Use type-only imports for backend types in the frontend: `import type { AppType } ...`
- Keep the `shared/` folder strictly for logic used by both frontend and backend

## 🛡️ Security Vulnerabilities

If you discover a security vulnerability, please do not open a public issue. Email the maintainer at hello@codemeoww.com instead.

## 💡 How to Help?

- Check the Issues tab for "good first issue" labels
- Help improve the documentation
- Suggest new features by opening a "Feature Request" issue

