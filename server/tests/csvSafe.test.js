// PRD-2026Q4 T0-7 followup（CSV formula injection / CWE-1236）回归测试：
// 单元行为 + 三个调用点（admin export / cro export / billing toCsv）的端到端断言。

const { escapeCsvCell, toCsv, _FORMULA_TRIGGERS } = require('../utils/csvSafe');

describe('utils/csvSafe.escapeCsvCell — formula injection guard', () => {
  test('null / undefined → empty quoted cell', () => {
    expect(escapeCsvCell(null)).toBe('""');
    expect(escapeCsvCell(undefined)).toBe('""');
  });

  test('plain string is just double-quoted', () => {
    expect(escapeCsvCell('hello')).toBe('"hello"');
  });

  test('embedded double quotes are doubled', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  test('numeric values stringify and quote', () => {
    expect(escapeCsvCell(42)).toBe('"42"');
    expect(escapeCsvCell(0)).toBe('"0"');
    expect(escapeCsvCell(3.14)).toBe('"3.14"');
  });

  test('Date renders as ISO string', () => {
    const d = new Date('2026-05-09T03:00:00.000Z');
    expect(escapeCsvCell(d)).toBe('"2026-05-09T03:00:00.000Z"');
  });

  // 关键反公式注入断言。
  for (const trigger of ['=', '+', '-', '@', '\t', '\r']) {
    test(`leading "${trigger.replace(/\t/g, '\\t').replace(/\r/g, '\\r')}" gets a single-quote prefix`, () => {
      const cell = escapeCsvCell(`${trigger}cmd|'/c calc'!A1`);
      // 第一个字符（紧贴前导双引号之后）应该是 ASCII 单引号 0x27
      expect(cell.charCodeAt(1)).toBe(0x27);
      expect(cell.startsWith(`"'${trigger}`)).toBe(true);
    });
  }

  test('non-trigger-leading strings are NOT prefixed', () => {
    expect(escapeCsvCell('hello = world')).toBe('"hello = world"');
    expect(escapeCsvCell(' =evil')).toBe('" =evil"'); // leading space, not =
  });

  test('FORMULA_TRIGGERS set is locked to 6 chars', () => {
    expect(_FORMULA_TRIGGERS.sort()).toEqual(['\t', '\r', '+', '-', '=', '@']);
  });
});

describe('utils/csvSafe.toCsv — array → CSV', () => {
  test('empty rows → empty string', () => {
    expect(toCsv([])).toBe('');
    expect(toCsv(null)).toBe('');
    expect(toCsv(undefined)).toBe('');
  });

  test('infers headers from union of keys (preserves insertion order of first row)', () => {
    const rows = [{ a: 1, b: 2 }, { a: 3, c: 4 }];
    const csv = toCsv(rows);
    const [header, ...body] = csv.split('\n');
    expect(header.split(',')).toEqual(['a', 'b', 'c']);
    expect(body).toEqual(['"1","2",""', '"3","","4"']);
  });

  test('honors explicit header order', () => {
    const csv = toCsv([{ a: 1, b: 2 }], ['b', 'a']);
    expect(csv).toBe('b,a\n"2","1"');
  });

  test('opts.escapeHeaders=true also quotes & defends headers', () => {
    const csv = toCsv([{ '=evil': 1 }], ['=evil'], { escapeHeaders: true });
    expect(csv.split('\n')[0]).toBe(`"'=evil"`);
  });

  test('formula-injection cell in body gets the prefix', () => {
    const csv = toCsv([{ name: '=HYPERLINK("https://evil","x")' }], ['name']);
    const [, dataLine] = csv.split('\n');
    expect(dataLine.startsWith(`"'=`)).toBe(true);
  });
});

// 集成断言：admin / cro / billing 三个出口都走 escapeCsvCell。
describe('integration: hot-path CSV exports defend formula injection', () => {
  test('billing.toCsv prefixes formula-leading cro_name', () => {
    const billing = require('../services/billing');
    const csv = billing.toCsv({
      month: '2026-04',
      total_count: 1,
      total_amount: 9.99,
      rows: [{
        cro_id: 'cro_1',
        cro_name: '=cmd|"/c calc"!A1', // attacker-supplied
        trial_id: 't1',
        qualified_status: 'screened',
        count: 1,
        unit_price: 9.99,
        amount: 9.99
      }]
    });
    expect(csv).toContain(`"'=cmd`); // single-quote prefixed inside double quotes
    expect(csv).not.toContain(`"=cmd`); // raw formula must NOT exist
  });
});
