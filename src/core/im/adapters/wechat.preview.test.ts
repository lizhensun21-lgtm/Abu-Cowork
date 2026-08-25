import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
vi.mock('../../llm/tauriFetch', () => ({
  getTauriFetch: vi.fn(async () => mockFetch),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({ tempDir: vi.fn() }));

import { getWeChatQRCode } from './wechat';

describe('real WeChat binding QR capability', () => {
  beforeEach(() => mockFetch.mockReset());

  it('requests and returns the iLink QR payload used for local QR rendering', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ret: 0,
        qrcode: 'poll-token',
        qrcode_img_content: 'https://liteapp.weixin.qq.com/preview-bind',
      }),
    });

    await expect(getWeChatQRCode()).resolves.toEqual({
      qrcode: 'poll-token',
      qrcode_img_content: 'https://liteapp.weixin.qq.com/preview-bind',
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
