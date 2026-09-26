import { isLoadFailure } from '../lazyTools';

describe('isLoadFailure', () => {
  it('knows a chunk that failed to arrive, in each browser’s words', () => {
    expect(isLoadFailure(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))).toBe(true);
    expect(isLoadFailure(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isLoadFailure(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('leaves every other failure to whoever caught it', () => {
    expect(isLoadFailure(new Error('Quota exceeded'))).toBe(false);
    expect(isLoadFailure(undefined)).toBe(false);
  });
});
