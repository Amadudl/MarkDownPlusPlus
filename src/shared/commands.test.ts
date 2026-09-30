import { describe, expect, it } from 'vitest';
import { CommandId, isCommandId } from './commands';

describe('CommandId', () => {
  it('uses unique, dotted ids', () => {
    const ids = Object.values(CommandId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+\.[a-zA-Z0-9]+$/);
  });
});

describe('isCommandId', () => {
  it('accepts every known command id', () => {
    for (const id of Object.values(CommandId)) expect(isCommandId(id)).toBe(true);
  });

  it.each([['file.delete'], [''], ['FileNew'], [42], [null], [undefined], [{}], [['file.new']]])(
    'rejects %j',
    (value) => {
      expect(isCommandId(value)).toBe(false);
    },
  );
});
