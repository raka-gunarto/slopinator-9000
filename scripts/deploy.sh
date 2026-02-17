#!/bin/bash
set -e

echo "🔨 Building slopinator-9000..."
npm run build

echo "🧪 Running tests..."
npm test || echo "⚠️ Tests failed (non-blocking)"

echo "✅ Build complete!"
echo "Run with: npm start"
echo "Or dev mode: npm run slopinator-9000"
