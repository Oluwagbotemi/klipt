import { MAX_MENU_DEPTH } from "@/lib/menus";

/*
 * Reordering for the menu editor. Items are a flat list in display order with
 * a depth; an item's "block" is the item plus the deeper items right after it
 * (its children). Moves keep blocks together so children travel with parents.
 */

type Item = { depth: number };

export function blockEnd(items: Item[], index: number) {
  let end = index + 1;
  while (end < items.length && items[end].depth > items[index].depth) end++;
  return end;
}

function previousSibling(items: Item[], index: number) {
  const depth = items[index].depth;
  for (let i = index - 1; i >= 0; i--) {
    if (items[i].depth === depth) return i;
    if (items[i].depth < depth) return null;
  }
  return null;
}

function nextSibling(items: Item[], index: number) {
  const end = blockEnd(items, index);
  return end < items.length && items[end].depth === items[index].depth ? end : null;
}

function deepestIn(items: Item[], index: number) {
  return Math.max(...items.slice(index, blockEnd(items, index)).map((item) => item.depth));
}

export function canMoveUp(items: Item[], index: number) {
  return previousSibling(items, index) !== null;
}

export function canMoveDown(items: Item[], index: number) {
  return nextSibling(items, index) !== null;
}

/** Indent makes the item a child of the item above it at the same level. */
export function canIndent(items: Item[], index: number) {
  return previousSibling(items, index) !== null && deepestIn(items, index) + 1 < MAX_MENU_DEPTH;
}

export function canOutdent(items: Item[], index: number) {
  return items[index].depth > 0;
}

export function moveUp<T extends Item>(items: T[], index: number): T[] {
  const target = previousSibling(items, index);
  if (target === null) return items;
  const end = blockEnd(items, index);
  return [
    ...items.slice(0, target),
    ...items.slice(index, end),
    ...items.slice(target, index),
    ...items.slice(end),
  ];
}

export function moveDown<T extends Item>(items: T[], index: number): T[] {
  const target = nextSibling(items, index);
  if (target === null) return items;
  const targetEnd = blockEnd(items, target);
  return [
    ...items.slice(0, index),
    ...items.slice(target, targetEnd),
    ...items.slice(index, target),
    ...items.slice(targetEnd),
  ];
}

function shiftBlock<T extends Item>(items: T[], index: number, by: 1 | -1): T[] {
  const end = blockEnd(items, index);
  return items.map((item, i) =>
    i >= index && i < end ? { ...item, depth: item.depth + by } : item,
  );
}

export function indent<T extends Item>(items: T[], index: number): T[] {
  return canIndent(items, index) ? shiftBlock(items, index, 1) : items;
}

/**
 * Moves the item out a level, placing it after its former parent's other
 * children, so siblings below it keep their parent.
 */
export function outdent<T extends Item>(items: T[], index: number): T[] {
  if (!canOutdent(items, index)) return items;
  const end = blockEnd(items, index);
  const depth = items[index].depth;
  let after = end;
  while (after < items.length && items[after].depth >= depth) after++;
  const block = items.slice(index, end).map((item) => ({ ...item, depth: item.depth - 1 }));
  return [...items.slice(0, index), ...items.slice(end, after), ...block, ...items.slice(after)];
}

/** Removes the item and its children. */
export function removeAt<T extends Item>(items: T[], index: number): T[] {
  return [...items.slice(0, index), ...items.slice(blockEnd(items, index))];
}
