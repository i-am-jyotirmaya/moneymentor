import { ApiError } from '../src/api/client';
import { bannerPriority, classifyFailure, sectionStatus, showNavLabels } from '../src/workspace/section-state';

test.each([new TypeError('Network request failed'), new Error('fetch failed'), undefined, new ApiError('No response', 0)])('no response is offline: %s', error => {
  expect(classifyFailure(error).kind).toBe('offline');
});
test.each([400, 401, 408, 429, 500, 503])('HTTP %i remains an error with server copy', status => {
  expect(classifyFailure(new ApiError('Server message', status))).toEqual({ kind: 'error', message: 'Server message' });
});
test('sections have a single state, with offline and failed refresh taking priority over cached data', () => {
  const base = { pending: false, hasData: true, empty: false, failure: null, offline: false };
  expect(sectionStatus(base)).toBe('ready');
  expect(sectionStatus({ ...base, empty: true })).toBe('empty');
  expect(sectionStatus({ ...base, pending: true, hasData: false })).toBe('loading');
  expect(sectionStatus({ ...base, pending: true })).toBe('ready');
  for (const hasData of [false, true]) {
    expect(sectionStatus({ ...base, hasData, failure: classifyFailure(new ApiError('Failure', 503)) })).toBe('error');
    expect(sectionStatus({ ...base, hasData, pending: true, offline: true })).toBe('offline');
    expect(sectionStatus({ ...base, hasData, failure: classifyFailure(new Error('fetch')) })).toBe('offline');
  }
});
test.each([[1, true], [1.49, true], [1.5, false], [2, false], [1.2, true]])('nav label visibility at fontScale %s is %s', (scale, visible) => {
  expect(showNavLabels(scale as number)).toBe(visible);
});
test('banner priority never selects more than one banner', () => {
  expect(bannerPriority({ offline: true, error: true, readOnly: true, info: true })).toBe('offline');
  expect(bannerPriority({ error: true, readOnly: true, info: true })).toBe('error');
  expect(bannerPriority({ readOnly: true, info: true })).toBe('readOnly');
  expect(bannerPriority({ info: true })).toBe('info');
  expect(bannerPriority({})).toBeNull();
});
