// solidity-coverage configuration
// Thresholds are enforced in CI via a dedicated check step (see .github/workflows/test.yml).
// Coverage baseline measured at plan-002 (post plan-001 tests):
//   All files: 89.47% Stmts, 79.75% Branch, 87.27% Funcs, 92.20% Lines
//   Marketplace.sol: 100% Stmts, 91.89% Branch (money-path critical)
// CI thresholds (set ~2pp below measured floor to catch regressions):
//   statements >= 87, branches >= 78, functions >= 85, lines >= 90
// Ratchet thresholds upward after each plan that adds test coverage.
module.exports = {
  reporter: ['text', 'lcov'],
};
