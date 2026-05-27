/**
 * Plan §Phase 2.3 客户端 SSE 测试。
 *
 * 覆盖：
 *   1) splitFrames：累积 buffer 切帧，残余 buffer 不丢
 *   2) parseFrame：'event:' / 'data:' / 注释 / 多行 data 拼接
 *   3) openParseStatusStream：
 *      - SDK 不支持 onChunkReceived → 返回 null（让上层走轮询）
 *      - chunkResp 推 state → onState 被调
 *      - chunkResp 推 done → onDone 被调，requestTask.abort 被触发
 *      - chunkResp 推 noredis → onError({code:'noredis'}) + abort
 *      - openTimeout：10s 内没收到任何 chunk → onError({code:'open_timeout'})
 */

const { openParseStatusStream, __testables } = require('../../utils/parse-status-stream');

describe('parse-status-stream: pure parsing', () => {
  test('splitFrames: 完整帧 + 残余', () => {
    const raw = 'event: state\ndata: {"a":1}\n\nevent: done\ndata: {"b":2}\n\nevent: state\ndata: ';
    const { frames, remainder } = __testables.splitFrames(raw);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatch(/event: state[\s\S]*"a":1/);
    expect(frames[1]).toMatch(/event: done[\s\S]*"b":2/);
    expect(remainder).toBe('event: state\ndata: ');
  });

  test('parseFrame: event + JSON data', () => {
    const r = __testables.parseFrame('event: state\ndata: {"status":"analyzing","progress":65}');
    expect(r).toEqual({ event: 'state', data: { status: 'analyzing', progress: 65 } });
  });

  test('parseFrame: preserves SSE id for replay-aware streams', () => {
    const r = __testables.parseFrame('id: rec-1:7\nevent: state\ndata: {"seq":7}');
    expect(r).toEqual({ event: 'state', id: 'rec-1:7', data: { seq: 7 } });
  });

  test('parseFrame: 没有 event 行 → 默认 message', () => {
    const r = __testables.parseFrame('data: {"x":1}');
    expect(r).toEqual({ event: 'message', data: { x: 1 } });
  });

  test('parseFrame: 注释行被忽略', () => {
    const r = __testables.parseFrame(': ping\nevent: state\ndata: {"k":"v"}');
    expect(r).toEqual({ event: 'state', data: { k: 'v' } });
  });

  test('parseFrame: 没有 data → null', () => {
    expect(__testables.parseFrame('event: state')).toBeNull();
    expect(__testables.parseFrame(': ping')).toBeNull();
  });

  test('parseFrame: 多行 data 拼接', () => {
    const r = __testables.parseFrame('event: state\ndata: line1\ndata: line2');
    // 两行 data 直接拼接成 "line1\nline2"，JSON.parse 失败 → null
    expect(r).toBeNull();
  });
});

describe('parse-status-stream: openParseStatusStream', () => {
  let mockTask;
  let mockWx;
  let chunkHandler;
  let abortMock;

  beforeEach(() => {
    abortMock = jest.fn();
    chunkHandler = null;
    mockTask = {
      abort: abortMock,
      onChunkReceived: jest.fn((cb) => { chunkHandler = cb; })
    };
    mockWx = {
      request: jest.fn(() => mockTask)
    };
  });

  test('SDK 不支持 onChunkReceived → 返回 null', () => {
    const noChunkTask = { abort: jest.fn() };
    const wx = { request: jest.fn(() => noChunkTask) };
    const stream = openParseStatusStream({
      wx,
      url: 'https://x/api/medical/parse-status-stream?recordIds=a',
      fileIds: ['a'],
      token: 'tk',
      onState: jest.fn(),
      onDone: jest.fn(),
      onError: jest.fn()
    });
    expect(stream).toBeNull();
    expect(noChunkTask.abort).toHaveBeenCalled();
  });

  test('参数缺失 → 返回 null', () => {
    expect(openParseStatusStream({ wx: mockWx, url: 'x', fileIds: [] })).toBeNull();
    expect(openParseStatusStream({ wx: mockWx, url: '', fileIds: ['a'] })).toBeNull();
  });

  test('chunkResp 推 state → onState 被调', () => {
    const onState = jest.fn();
    const onDone = jest.fn();
    const stream = openParseStatusStream({
      wx: mockWx,
      url: 'x',
      fileIds: ['a'],
      token: 't',
      onState,
      onDone,
      onError: jest.fn()
    });
    expect(stream).not.toBeNull();
    expect(typeof chunkHandler).toBe('function');

    const text = 'event: state\ndata: {"recordId":"a","status":"analyzing","progress":65}\n\n';
    const buf = new TextEncoder().encode(text).buffer;
    chunkHandler({ data: buf });

    expect(onState).toHaveBeenCalledWith({ recordId: 'a', status: 'analyzing', progress: 65 });
    expect(onDone).not.toHaveBeenCalled();
    expect(abortMock).not.toHaveBeenCalled();
  });

  test('batch_state / merge_preview 透传给对应回调', () => {
    const onBatchState = jest.fn();
    const onMergePreview = jest.fn();
    openParseStatusStream({
      wx: mockWx,
      url: 'x',
      fileIds: ['a', 'b'],
      onState: jest.fn(),
      onBatchState,
      onMergePreview,
      onDone: jest.fn(),
      onError: jest.fn()
    });
    const text = [
      'event: batch_state\ndata: {"batchId":"batch-1","processedCount":1,"successCount":1,"total":2}',
      '',
      'event: merge_preview\ndata: {"caseDraft":{"diagnosis":"直肠癌"}}',
      '',
      ''
    ].join('\n');
    chunkHandler({ data: new TextEncoder().encode(text).buffer });
    expect(onBatchState).toHaveBeenCalledWith({
      batchId: 'batch-1',
      processedCount: 1,
      successCount: 1,
      total: 2
    });
    expect(onMergePreview).toHaveBeenCalledWith({ caseDraft: { diagnosis: '直肠癌' } });
  });

  test('chunkResp 推 done → onDone + abort + clear timer', () => {
    const onState = jest.fn();
    const onDone = jest.fn();
    openParseStatusStream({
      wx: mockWx,
      url: 'x',
      fileIds: ['a'],
      onState,
      onDone,
      onError: jest.fn(),
      openTimeoutMs: 5
    });
    const txt = 'event: done\ndata: {"reason":"all_terminal"}\n\n';
    chunkHandler({ data: new TextEncoder().encode(txt).buffer });
    expect(onDone).toHaveBeenCalledWith({ reason: 'all_terminal' });
    expect(abortMock).toHaveBeenCalled();
  });

  test('noredis → onError({code:noredis}) + abort', () => {
    const onError = jest.fn();
    const onState = jest.fn();
    openParseStatusStream({
      wx: mockWx,
      url: 'x',
      fileIds: ['a'],
      onState,
      onDone: jest.fn(),
      onError
    });
    const txt = 'event: noredis\ndata: {"fallback":"polling"}\n\n';
    chunkHandler({ data: new TextEncoder().encode(txt).buffer });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'noredis', fallback: 'polling' }));
    expect(onState).not.toHaveBeenCalled();
    expect(abortMock).toHaveBeenCalled();
  });

  test('open_timeout：N 秒内没收到任何 chunk', () => {
    jest.useFakeTimers();
    const onError = jest.fn();
    openParseStatusStream({
      wx: mockWx,
      url: 'x',
      fileIds: ['a'],
      onState: jest.fn(),
      onDone: jest.fn(),
      onError,
      openTimeoutMs: 1000
    });
    expect(onError).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1100);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'open_timeout' }));
    expect(abortMock).toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('帧分两次到达：累积 buffer 正确切', () => {
    const onState = jest.fn();
    openParseStatusStream({
      wx: mockWx,
      url: 'x',
      fileIds: ['a'],
      onState,
      onDone: jest.fn(),
      onError: jest.fn()
    });
    // 第 1 块只是头 + 半个 data
    chunkHandler({ data: new TextEncoder().encode('event: state\ndata: {"x":').buffer });
    expect(onState).not.toHaveBeenCalled();
    // 第 2 块完成那一帧 + 紧跟下一帧
    chunkHandler({ data: new TextEncoder().encode('1}\n\nevent: state\ndata: {"x":2}\n\n').buffer });
    expect(onState).toHaveBeenCalledTimes(2);
    expect(onState.mock.calls[0][0]).toEqual({ x: 1 });
    expect(onState.mock.calls[1][0]).toEqual({ x: 2 });
  });

  test('close() → 关闭 + abort，后续 chunk 被忽略', () => {
    const onState = jest.fn();
    const stream = openParseStatusStream({
      wx: mockWx,
      url: 'x',
      fileIds: ['a'],
      onState,
      onDone: jest.fn(),
      onError: jest.fn()
    });
    stream.close();
    expect(abortMock).toHaveBeenCalled();
    chunkHandler({ data: new TextEncoder().encode('event: state\ndata: {"x":1}\n\n').buffer });
    expect(onState).not.toHaveBeenCalled();
  });
});
