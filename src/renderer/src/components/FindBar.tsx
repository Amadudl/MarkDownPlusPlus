import { useEffect, useId, useRef, useState, type KeyboardEvent, type JSX } from 'react';
import { ArrowDown, ArrowUp, CaseSensitive, ChevronRight, Regex, WholeWord, X } from 'lucide-react';
import { createRegexProbe, REGEX_TOO_SLOW_ERROR, type RegexProbe } from '@renderer/editor/regex-probe';
import type { SearchController, SearchState } from '@renderer/editor/types';
import { useActiveAdapter } from '@renderer/hooks/useActiveAdapter';
import { useUi } from '@renderer/store/ui';
import { IconButton } from './common/IconButton';

const EMPTY_RESULT: SearchState = { total: 0, current: 0, error: null };

/** Text describing a search result, e.g. `3 of 12`. */
export function describeResult(text: string, result: SearchState): string {
  if (result.error !== null) return result.error;
  if (text === '') return '';
  if (result.total === 0) return 'No results';
  return `${result.current} of ${result.total}`;
}

/**
 * Find & replace bar operating on the active editor's search controller.
 *
 * - The query is pushed into the editor from an effect; the displayed result
 *   follows the controller's subscription, so it stays current while the
 *   document is edited.
 * - Regular expressions are first timed against the document in a worker
 *   (see `editor/regex-probe`) and refused when they are too slow.
 * - When the active editor changes or the bar closes, the previous editor's
 *   search (and its highlights) is cleared.
 */
export function FindBar(): JSX.Element | null {
  const { open, replace, focusToken } = useUi((state) => state.findBar);
  const adapter = useActiveAdapter();
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regexp, setRegexp] = useState(false);
  const [result, setResult] = useState<SearchState>(EMPTY_RESULT);
  const probeRef = useRef<RegexProbe | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const findId = useId();
  const replaceId = useId();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open, focusToken]);

  useEffect(
    () => () => {
      probeRef.current?.dispose();
      probeRef.current = null;
    },
    [],
  );

  // Follow the editor's search state; clear its search when it stops being the target.
  useEffect(() => {
    if (!open || adapter === undefined) return undefined;
    const unsubscribe = adapter.search.subscribe(setResult);
    return () => {
      unsubscribe();
      adapter.search.clear();
    };
  }, [open, adapter]);

  useEffect(() => {
    if (!open || adapter === undefined) return undefined;
    // Results reach `result` through the subscription above.
    const query = { text, caseSensitive, wholeWord, regexp };
    if (!regexp) {
      adapter.search.setQuery(query);
      return undefined;
    }
    let current = true;
    probeRef.current ??= createRegexProbe();
    void probeRef.current.check(query, adapter.getMarkdown()).then((verdict) => {
      if (!current || verdict === 'cancelled') return;
      if (verdict === 'ok') {
        adapter.search.setQuery(query);
      } else {
        adapter.search.clear();
        setResult({ total: 0, current: 0, error: REGEX_TOO_SLOW_ERROR });
      }
    });
    return () => {
      current = false;
    };
  }, [open, adapter, text, caseSensitive, wholeWord, regexp]);

  if (!open) return null;
  const shown = adapter === undefined ? EMPTY_RESULT : result;

  const run = (action: (search: SearchController) => SearchState): void => {
    if (adapter !== undefined && text !== '' && shown.error === null) action(adapter.search);
  };

  const close = (): void => {
    setText('');
    setReplacement('');
    // Closing clears the editor's search through the subscription effect's cleanup.
    useUi.getState().closeFind();
    adapter?.focus();
  };

  const onFindKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      run((search) => (event.shiftKey ? search.findPrevious() : search.findNext()));
    }
  };

  const onReplaceKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      run((search) =>
        event.ctrlKey || event.metaKey ? search.replaceAll(replacement) : search.replaceCurrent(replacement),
      );
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const summary = describeResult(text, shown);
  return (
    <div className="findbar" role="search" aria-label="Find and replace" onKeyDown={onKeyDown}>
      <IconButton
        className="findbar-expand"
        label={replace ? 'Hide replace' : 'Show replace'}
        icon={ChevronRight}
        pressed={replace}
        iconSize={14}
        onClick={() => useUi.getState().openFind(!replace)}
      />
      <div className="findbar-rows">
        <div className="findbar-row">
          <div className="findbar-field" data-error={shown.error !== null}>
            <label htmlFor={findId} className="visually-hidden">
              Find
            </label>
            <input
              ref={inputRef}
              id={findId}
              type="text"
              className="findbar-input"
              placeholder="Find"
              spellCheck={false}
              value={text}
              aria-invalid={shown.error !== null}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onFindKeyDown}
            />
            <IconButton
              label="Match case"
              icon={CaseSensitive}
              pressed={caseSensitive}
              iconSize={15}
              onClick={() => setCaseSensitive(!caseSensitive)}
            />
            <IconButton
              label="Match whole word"
              icon={WholeWord}
              pressed={wholeWord}
              iconSize={15}
              onClick={() => setWholeWord(!wholeWord)}
            />
            <IconButton
              label="Use regular expression"
              icon={Regex}
              pressed={regexp}
              iconSize={15}
              onClick={() => setRegexp(!regexp)}
            />
          </div>
          <span className="findbar-count" aria-live="polite" data-error={shown.error !== null}>
            {summary}
          </span>
          <IconButton
            label="Previous match"
            shortcut="Shift+Enter"
            icon={ArrowUp}
            iconSize={15}
            disabled={shown.total === 0}
            onClick={() => run((search) => search.findPrevious())}
          />
          <IconButton
            label="Next match"
            shortcut="Enter"
            icon={ArrowDown}
            iconSize={15}
            disabled={shown.total === 0}
            onClick={() => run((search) => search.findNext())}
          />
          <IconButton
            label="Close"
            shortcut="Esc"
            icon={X}
            iconSize={15}
            tooltipPlacement="left"
            onClick={close}
          />
        </div>
        {replace && (
          <div className="findbar-row">
            <div className="findbar-field">
              <label htmlFor={replaceId} className="visually-hidden">
                Replace
              </label>
              <input
                id={replaceId}
                type="text"
                className="findbar-input"
                placeholder="Replace"
                spellCheck={false}
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
                onKeyDown={onReplaceKeyDown}
              />
            </div>
            <button
              type="button"
              className="button button-small"
              disabled={shown.total === 0}
              onClick={() => run((search) => search.replaceCurrent(replacement))}
            >
              Replace
            </button>
            <button
              type="button"
              className="button button-small"
              disabled={shown.total === 0}
              onClick={() => run((search) => search.replaceAll(replacement))}
            >
              Replace all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
