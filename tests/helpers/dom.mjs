/**
 * 테스트용 최소 DOM — 실제 브라우저 없이 그리기 규칙만 확인한다.
 *
 * `document.createElement`가 돌려주는 것처럼 보이는 객체 하나에 이 파일이 쓰는 만큼만 담았다:
 * `className`·`textContent`·`title`·`disabled`·`hidden`·`attrs`·`dataset`·`style`·`children`,
 * `classList`(add/remove/toggle/contains), `append`/`appendChild`/`remove`/`focus`,
 * `setAttribute`(`data-*`는 `dataset`으로도), `innerHTML`(문자열만 보관), `querySelector`(클래스 하나).
 *
 * DOM을 실제로 붙이는 창(스킬·가방·우편 등)의 테스트가 이 한 벌을 함께 쓴다 — 스텁이 갈라지면
 * 같은 화면을 두 테스트가 다르게 보게 된다.
 */
export function element(tag = 'div') {
  const node = {
    tag, className: '', textContent: '', title: '', disabled: false, hidden: false,
    attrs: {}, dataset: {}, style: {}, children: [], parentNode: null, scrollTop: 0, onclick: null, onscroll: null,
    classList: {
      add(name) { if (!node.classList.contains(name)) node.className = `${node.className} ${name}`.trim(); },
      remove(name) { node.className = node.className.split(/\s+/).filter(token => token && token !== name).join(' '); },
      contains: name => node.className.split(/\s+/).includes(name),
      toggle(name, on) { if (on === undefined ? !node.classList.contains(name) : on) node.classList.add(name); else node.classList.remove(name); }
    },
    append(...kids) { for (const kid of kids) node.appendChild(kid); },
    appendChild(kid) { if (kid && typeof kid === 'object') { kid.parentNode = node; node.children.push(kid); } return kid; },
    setAttribute(key, value) {
      node.attrs[key] = value;
      if (key.startsWith('data-')) node.dataset[key.slice(5)] = value;
    },
    getAttribute(key) { return node.attrs[key]; },
    remove() { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node); },
    focus() {},
    querySelector(selector) { return query(node, selector); }
  };
  Object.defineProperty(node, 'innerHTML', { get() { return node._html ?? ''; }, set(value) { node._html = value; } });
  return node;
}

/** `.class` 하나만 다루는 querySelector — 화면 코드가 쓰는 만큼만. */
export function query(root, selector) {
  const token = selector.replace(/^\./, '').split(/[ >]/)[0];
  for (const child of root.children ?? []) {
    if (String(child.className).split(/\s+/).includes(token)) return child;
    const found = query(child, selector);
    if (found) return found;
  }
  return undefined;
}

export function walk(root, out = []) { for (const child of root.children ?? []) { out.push(child); walk(child, out); } return out; }
export const byClass = (root, token) => walk(root).filter(node => String(node.className).split(/\s+/).includes(token));
export const one = (root, token) => byClass(root, token)[0];
export const textOf = (root, token) => byClass(root, token).map(node => node.textContent);
/** 클래스 여러 개를 모두 가진 첫 요소(`.skill-compare.is-current` 같은 선택자). */
export const withClasses = (root, ...tokens) => walk(root).find(node => tokens.every(token => String(node.className).split(/\s+/).includes(token)));

/** `document` 전역을 이 스텁으로 바꾼다 — 끝나면 `restore()`로 되돌린다. */
export function installDocument() {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  return () => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; };
}
