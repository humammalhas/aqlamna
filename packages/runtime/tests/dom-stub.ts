// ---------------------------------------------------------------------------
// Minimal DOM stub for driving the SHIPPED runtime bundle inside Node.
//
// The bundle is plain browser JS with zero dependencies, so the only way to
// exercise the code that actually ships is to hand it a fake `document`.
// Shared by export.spec.ts and paragraphs.spec.ts — one copy, on purpose.
// ---------------------------------------------------------------------------

export interface FakeNode {
  _tag: string;
  className: string;
  textContent: string;
  innerHTML: string;
  src: string;
  alt: string;
  title: string;
  children: FakeNode[];
  /** Set by appendChild. `remove()` and `parentNode` both need it. */
  _parent: FakeNode | null;
  parentNode: FakeNode | null;
  _listeners: Record<string, Array<() => void>>;
  appendChild(child: FakeNode): void;
  addEventListener(type: string, fn: () => void): void;
  querySelector(sel: string): FakeNode | null;
  remove(): void;
  click(): void;
}

export function fakeCreateTextNode(text: string): FakeNode {
  return {
    _tag: "#text",
    className: "",
    textContent: text,
    innerHTML: "",
    src: "",
    alt: "",
    title: "",
    children: [],
    _parent: null,
    parentNode: null,
    _listeners: {},
    appendChild() {},
    addEventListener() {},
    querySelector() {
      return null;
    },
    remove() {},
    click() {},
  };
}

export function fakeCreateElement(tag: string): FakeNode {
  const children: FakeNode[] = [];
  let html = "";

  const el: FakeNode = {
    _tag: tag,
    className: "",
    textContent: "",

    // The real DOM discards every child when innerHTML is assigned, and
    // renderScene opens with `container.innerHTML = ""`. A stub that kept the
    // old children would leave a stale scene in the tree, so a test that clicks
    // and then looks would find the PREVIOUS render — passing while the browser
    // showed something else. Every multi-render assertion depends on this.
    get innerHTML() {
      return html;
    },
    set innerHTML(value: string) {
      html = value;
      children.length = 0;
    },

    src: "",
    alt: "",
    title: "",
    children,
    _parent: null,
    // Mirrors _parent. showFeedback's timeout reads `span.parentNode` before
    // removing, so a stub without it silently skips the removal.
    get parentNode(): FakeNode | null {
      return el._parent;
    },
    set parentNode(p: FakeNode | null) {
      el._parent = p;
    },
    _listeners: {},
    appendChild(child: FakeNode) {
      child._parent = el;
      children.push(child);
    },
    addEventListener(type: string, fn: () => void) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    querySelector(sel: string) {
      const wanted = sel.replace(/^\./, "");
      for (const child of this.children) {
        if (child.className === wanted) return child;
        const found = child.querySelector(sel);
        if (found) return found;
      }
      return null;
    },
    remove() {
      const parent = this._parent;
      if (!parent) return;
      const i = parent.children.indexOf(this);
      if (i >= 0) parent.children.splice(i, 1);
      this._parent = null;
    },
    click() {
      (this._listeners["click"] || []).forEach((fn) => fn());
    },
  };
  return el;
}

/** Find a button in the fake DOM tree by its text content. */
export function findButton(root: FakeNode, text: string): FakeNode | null {
  function search(el: FakeNode): FakeNode | null {
    if (el._tag === "button" && el.textContent.includes(text)) return el;
    for (const child of el.children) {
      const found = search(child);
      if (found) return found;
    }
    return null;
  }
  return search(root);
}

/**
 * Collect all text content recursively.
 *
 * A `<br>` becomes "\n". It carries no text of its own, so without this it
 * contributes nothing and the strings on either side of it read as one run —
 * which is exactly what a welded paragraph looks like. §1.16 puts a real line
 * break inside a paragraph (`{"value": null}`), so the weld check has to be
 * able to tell that apart from prose glued together, and the browser draws a
 * line ending there.
 */
export function collectText(el: FakeNode): string {
  if (el._tag === "br") return "\n";
  if (el.textContent && el.children.length === 0) return el.textContent;
  return el.children.map(collectText).join("");
}

/** Every descendant (and self) whose tag matches. */
export function findAllByTag(root: FakeNode, tag: string): FakeNode[] {
  const out: FakeNode[] = [];
  function walk(el: FakeNode): void {
    if (el._tag === tag) out.push(el);
    for (const child of el.children) walk(child);
  }
  walk(root);
  return out;
}

/** The `div.aq-output` inside a rendered player root. */
export function findOutput(root: FakeNode): FakeNode {
  const found = root.querySelector(".aq-output");
  if (!found) throw new Error("No .aq-output rendered");
  return found;
}

export interface StubEnv {
  document: unknown;
  localStorage: unknown;
  player: FakeNode;
}

/** Build a document/localStorage pair the bundle bootstrap can run against. */
export function makeStubEnv(storyJson: unknown): StubEnv {
  const player = fakeCreateElement("div");
  const document = {
    getElementById(id: string) {
      if (id === "qalam-story") return { textContent: JSON.stringify(storyJson) };
      if (id === "qalam-player") return player;
      return null;
    },
    createElement: fakeCreateElement,
    createTextNode: fakeCreateTextNode,
  };
  const store: Record<string, string> = {};
  const localStorage = {
    setItem(k: string, v: string) {
      store[k] = v;
    },
    getItem(k: string) {
      return store[k] ?? null;
    },
    removeItem(k: string) {
      delete store[k];
    },
  };
  return { document, localStorage, player };
}
