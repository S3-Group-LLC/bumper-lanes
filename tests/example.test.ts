// An example test to copy. Every change should come with a test like this:
// it checks one small thing and says in plain words what should happen.
//
// Run all tests with:  npm test
import { describe, it, expect } from 'vitest';
import { formatPrice } from '@/lib/format';

describe('formatPrice', () => {
  it('shows cents as dollars with a $ sign', () => {
    expect(formatPrice(350)).toBe('$3.50');
  });

  it('shows whole dollars with two decimals', () => {
    expect(formatPrice(800)).toBe('$8.00');
  });

  it('can show other currencies', () => {
    expect(formatPrice(1200, 'EUR', 'en-GB')).toBe('€12.00');
  });
});
