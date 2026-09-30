/**
 * Minimal structural types for code that runs inside the renderer through
 * `page.evaluate` / `locator.evaluate`.
 *
 * The E2E tests are type-checked with `tsconfig.node.json`, which (on purpose)
 * does not include the DOM library, so Playwright's DOM parameter types
 * resolve to error types there. Callbacks passed to `evaluate` annotate their
 * parameters with these interfaces, or cast `globalThis` to
 * {@link RendererGlobals}. The functions are serialised and executed in the
 * page, so only these *types* may be referenced inside them, never values.
 */

/** The subset of `CSSStyleDeclaration` the tests read. */
export interface DomStyle {
  getPropertyValue(name: string): string;
}

/** The subset of `Element` / `HTMLElement` the tests use. */
export interface DomElement {
  readonly tagName: string;
  readonly textContent: string | null;
  readonly innerHTML: string;
  readonly style: DomStyle;
  readonly children: ArrayLike<DomElement>;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  closest(selector: string): DomElement | null;
  focus(): void;
  click(): void;
}

/** The subset of `HTMLImageElement` the tests use. */
export interface DomImage extends DomElement {
  readonly complete: boolean;
  readonly naturalWidth: number;
  readonly currentSrc: string;
  readonly src: string;
}

/** The subset of `Document` the tests use. */
export interface DomDocument {
  readonly documentElement: DomElement;
  readonly body: DomElement;
  readonly title: string;
  readonly activeElement: DomElement | null;
  querySelector(selector: string): DomElement | null;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
}

/** Globals of the renderer (page) realm that the tests inspect. */
export interface RendererGlobals {
  readonly document: DomDocument;
  readonly location: { readonly href: string; readonly protocol: string };
  open(url: string, target?: string): unknown;
  getComputedStyle(element: DomElement): DomStyle;
  fetch(url: string): Promise<{
    readonly ok: boolean;
    readonly status: number;
    readonly headers: { get(name: string): string | null };
  }>;
  eval(code: string): unknown;
  readonly [key: string]: unknown;
}
