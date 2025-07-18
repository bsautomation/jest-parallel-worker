#!/bin/bash

# Jest Parallel Worker - Test Examples Script
# This script demonstrates various ways to use the jest-parallel CLI

echo "🧪 Jest Parallel Worker - Enhanced CLI Examples"
echo "================================================"
echo "✨ Now includes Memory Tracking, PID Isolation, and Performance Metrics by default!"
echo ""

# Make sure we're in the right directory
cd "$(dirname "$0")/.."

echo "📋 Available Test Files:"
find examples -name "*.test.js" -exec echo "  - {}" \;
echo ""

echo "🚀 Example 1: Basic parallel execution with enhanced logging"
echo "Command: npx jest-parallel --workers 4 --testMatch '**/examples/simple.test.js'"
echo "✨ Shows: Memory usage, PID isolation, performance metrics"
echo "Press Enter to run..."
read -r
npx jest-parallel --workers 4 --testMatch "**/examples/simple.test.js"
echo ""

echo "⚡ Example 2: Verbose output with detailed memory and PID tracking"
echo "Command: npx jest-parallel --workers 2 --verbose --testMatch '**/examples/async.test.js'"
echo "✨ Shows: Per-test memory deltas, individual PIDs, real-time progress"
echo "Press Enter to run..."
read -r
npx jest-parallel --workers 2 --verbose --testMatch "**/examples/async.test.js"
echo ""

echo "💾 Example 3: Memory-intensive tests with tracking"
echo "Command: npx jest-parallel --testMatch '**/examples/memory.test.js' --verbose"
echo "✨ Shows: Memory consumption analysis, memory leaks detection"
echo "Press Enter to run..."
read -r
npx jest-parallel --testMatch "**/examples/memory.test.js" --verbose
echo ""

echo "🎯 Example 4: Performance tests with comprehensive metrics"
echo "Command: npx jest-parallel --testMatch '**/examples/performance.test.js'"
echo "✨ Shows: Parallel speedup, worker efficiency, memory usage"
echo "Press Enter to run..."
read -r
npx jest-parallel --testMatch "**/examples/performance.test.js"
echo ""

echo "� Example 5: Compare single vs multiple workers"
echo "Command: npx jest-parallel --workers 1 --testMatch '**/examples/comprehensive.test.js'"
echo "✨ Shows: Sequential execution baseline"
echo "Press Enter to run..."
read -r
npx jest-parallel --workers 1 --testMatch "**/examples/comprehensive.test.js"
echo ""

echo "🔧 Example 6: Multiple workers showing parallel benefits"
echo "Command: npx jest-parallel --workers 4 --testMatch '**/examples/comprehensive.test.js'"
echo "✨ Shows: Parallel speedup comparison with Example 5"
echo "Press Enter to run..."
read -r
npx jest-parallel --workers 4 --testMatch "**/examples/comprehensive.test.js"
echo ""

echo "🧪 Example 7: All examples with full analysis"
echo "Command: npx jest-parallel --workers 3 --testMatch '**/examples/*.test.js'"
echo "✨ Shows: Complete suite analysis with all metrics"
echo "Press Enter to run..."
read -r
npx jest-parallel --workers 3 --testMatch "**/examples/*.test.js"
echo ""

echo "📈 Example 8: Coverage collection with memory tracking"
echo "Command: npx jest-parallel --coverage --testMatch '**/examples/simple.test.js'"
echo "✨ Shows: Code coverage + memory analysis"
echo "Press Enter to run..."
read -r
npx jest-parallel --coverage --testMatch "**/examples/simple.test.js"
echo ""

echo "✅ All CLI examples completed!"
echo ""
echo "💡 Additional commands you can try:"
echo "  npx jest-parallel --help                    # Show all options"
echo "  npx jest-parallel --workers 8               # Use 8 workers"
echo "  npx jest-parallel --silent                  # Silent mode"
echo "  npx jest-parallel --testTimeout 5000        # Set test timeout"
echo "  npx jest-parallel --config jest.config.js   # Use custom config"
echo ""
echo "🔗 For programmatic usage, see: examples/usage-example.js"