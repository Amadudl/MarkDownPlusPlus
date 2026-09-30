/**
 * Web Worker entry of the regular expression probe (see `regex-probe.ts`).
 * It only runs the search it is sent and reports how long it took; the main
 * thread terminates it when it takes too long.
 */
import { type RegexProbeRequest, runRegexProbe } from './regex-probe';

addEventListener('message', (event: MessageEvent<RegexProbeRequest>) => {
  postMessage(runRegexProbe(event.data));
});
