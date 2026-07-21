// @illusion: TestState -> shared counters -> tracks pass/fail totals
export interface TestState {
  passed: number;
  failed: number;
}

// @illusion: create_state -> returns fresh counter set to zero
export function createState(): TestState {
  return { passed: 0, failed: 0 };
}

// @illusion: assert -> checks condition -> logs pass/fail -> updates counters
export function assert(state: TestState, label: string, condition: boolean, detail?: string): void {
  if (condition) {
    state.passed++;
    console.log(`  PASS: ${label}`);
  } else {
    state.failed++;
    console.error(`  FAIL: ${label}${detail ? ' - ' + detail : ''}`);
  }
}

// @illusion: print_results -> logs final tally -> returns exit code
export function printResults(state: TestState, suite: string): number {
  console.log(`\n${suite}: ${state.passed} passed, ${state.failed} failed`);
  return state.failed > 0 ? 1 : 0;
}
