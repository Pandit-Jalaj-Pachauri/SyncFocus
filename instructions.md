# SyncFocus — Team Instructions

## 1. Project Structure

```bash
SyncFocus/
├── extension/       # Existing Chrome extension
├── frontend/        # React + Vite + Tailwind CSS
├── backend/         # Node.js + Express + MongoDB
├── instructions.md
└── README.md
```

**Current priority:** Build the frontend and backend. Extension development is paused until further discussion.

## 2. GitHub Workflow

- Use the shared GitHub repository.
- Work on your own feature branch, not directly on `main`.
- Commit and push your changes regularly.
- Create a Pull Request (PR) to merge your work into `main`.
- Test your changes before requesting a review.

## 3. Setup

Clone the repository:

```bash
git clone <REPOSITORY_URL>
cd SyncFocus
```

Update your local `main` before starting a task:

```bash
git checkout main
git pull origin main
```

## 4. Create Your Branch

Create a separate branch for your assigned feature:

```bash
git checkout -b feature/your-feature
```

Examples:
- `feature/dashboard`
- `feature/auth`
- `feature/backend`
- `feature/analytics`

## 5. Commit and Push

After making your changes:

```bash
git status
git add <file-or-folder>
git commit -m "Add dashboard page"
git push -u origin feature/your-feature
```

For subsequent updates:

```bash
git add <file-or-folder>
git commit -m "Update dashboard page"
git push
```

## 6. Create a Pull Request

1. Open the shared repository on GitHub.
2. Create a Pull Request from your feature branch to `main`.
3. Briefly describe your changes.
4. Address any requested feedback.
5. Merge after approval.

**Please do not push directly to `main`.**

## 7. Update Your Branch

Before starting new work, update your local `main`:

```bash
git checkout main
git pull origin main
```

To bring the latest `main` changes into your existing feature branch, first save or commit your work, then run:

```bash
git fetch origin
git merge origin/main
```

Resolve any conflicts and test before pushing.

## 8. Important Rules

- Keep changes limited to your assigned feature.
- Do not modify another member's work without coordinating with them.
- Never commit `.env` files, passwords, API keys, or database credentials.
- Do not commit `node_modules` or generated build files.
- Use meaningful commit messages.
- Communicate blockers early.
- Keep your branch and Pull Request updated.

## 9. Contribution Tracking

Please ensure your work is reflected through your own GitHub account, commits, feature branches, and Pull Requests.

**Let's keep development organized and focus on completing SyncFocus together.**