/**
 * Web Worker entry of the regular expression probe (see `regex-probe.ts`).
 * It only runs the search it is sent and reports how long it took; the main
 * thread terminates it when it takes too long.
 *
 * A dedicated worker receives messages only from the page that created it
 * (their `origin` is always empty and `source` null, so there is no origin to
 * check); every message is validated against the request schema instead and
 * anything else is dropped without running.
 */
import { parseRegexProbeRequest, runRegexProbe } from './regex-probe';

addEventListener('message', (event: MessageEvent<unknown>) => {
  const request = parseRegexProbeRequest(event.data);
  if (request === null) {
    console.error('The regular expression probe ignored a malformed request');
    return;
  }
  postMessage(runRegexProbe(request));
});
