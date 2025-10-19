#!/bin/bash
# Sync main branch with upstream (ShunsukeHayashi/Miyabi)
# This ensures your fork's main is always up-to-date with the original repository

set -e

echo "🔄 Syncing with upstream (ShunsukeHayashi/Miyabi)..."

# Fetch latest from upstream
echo "📥 Fetching upstream..."
git fetch upstream

# Check if on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "⚠️  Not on main branch. Switching to main..."
  git checkout main
fi

# Reset main to upstream/main
echo "🔄 Resetting main to upstream/main..."
git reset --hard upstream/main

# Push to origin
echo "📤 Pushing to origin..."
git push origin main --force

echo "✅ Sync complete! Your main branch is now identical to upstream."
echo ""
echo "📊 Current status:"
git log --oneline -3
echo ""
echo "💡 To work on your own changes, create a new branch:"
echo "   git checkout -b feature/your-feature-name"
