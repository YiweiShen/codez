import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Readable } from 'stream';

import * as core from '@actions/core';
import axios from 'axios';

import { extractImageUrls, downloadImages } from '../../../src/file/images';

jest.mock('axios');
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedCoreInfo = core.info as jest.Mock;
const mockedCoreWarning = core.warning as jest.Mock;

/**
 *
 * @param data
 */

/**
 *
 * @param data
 */

/**
 *
 * @param data
 */

/**
 *
 * @param data
 */

/**
 *
 * @param data
 */

/**
 *
 * @param data
 */

/**
 *
 * @param data
 */

/**
 *
 * @param data
 */

/**
 *
 * @param data
 */

/**
 *
 * @param data
 */

function createStream(data: string): Readable {
  const stream = new Readable();
  stream.push(data);
  stream.push(null);
  return stream;
}

describe('extractImageUrls', () => {
  it('extracts markdown image URLs', () => {
    const text =
      'Some text ![alt text](https://example.com/image.png) and more';
    expect(extractImageUrls(text)).toEqual(['https://example.com/image.png']);
  });

  it('extracts HTML img tag src URLs', () => {
    const text = '<p><img src="https://example.com/photo.jpg" alt=""/></p>';
    expect(extractImageUrls(text)).toEqual(['https://example.com/photo.jpg']);
  });

  it('deduplicates duplicate URLs', () => {
    const url = 'https://example.com/dup.png';
    const text = `![a](${url}) <img src="${url}"/> ![b](${url})`;
    expect(extractImageUrls(text)).toEqual([url]);
  });

  it('returns empty array when no images', () => {
    expect(extractImageUrls('no images here')).toEqual([]);
  });
});

describe('downloadImages', () => {
  let downloadDir: string;

  beforeEach(() => {
    downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'images-test-'));
    mockedCoreInfo.mockClear();
    mockedCoreWarning.mockClear();
  });

  afterEach(() => {
    fs.rmSync(downloadDir, { recursive: true, force: true });
    mockedAxios.get.mockReset();
  });

  it('all URLs succeed -> files written and relative paths returned', async () => {
    const urls = [
      'https://example.com/image1.png',
      'https://example.com/image2.jpg',
    ];
    mockedAxios.get.mockImplementation((url: string) =>
      Promise.resolve({ data: createStream('filecontent') } as any),
    );

    const result = await downloadImages(urls, downloadDir);

    const rel1 = path.relative(
      process.cwd(),
      path.join(downloadDir, 'image1.png'),
    );
    const rel2 = path.relative(
      process.cwd(),
      path.join(downloadDir, 'image2.jpg'),
    );
    expect(result).toEqual([rel1, rel2]);

    expect(fs.readFileSync(path.join(downloadDir, 'image1.png'), 'utf-8')).toBe(
      'filecontent',
    );
    expect(fs.readFileSync(path.join(downloadDir, 'image2.jpg'), 'utf-8')).toBe(
      'filecontent',
    );

    expect(mockedCoreInfo).toHaveBeenCalledTimes(2);
  });

  it('some URLs fail -> warnings logged, successes still returned', async () => {
    const goodURL = 'https://example.com/good.png';
    const badURL = 'https://example.com/bad.jpg';
    mockedAxios.get.mockImplementation((url: string) => {
      if (url === badURL) {
        return Promise.reject(new Error('request failed'));
      }
      return Promise.resolve({ data: createStream('gooddata') } as any);
    });

    const result = await downloadImages([goodURL, badURL], downloadDir);

    const relGood = path.relative(
      process.cwd(),
      path.join(downloadDir, 'good.png'),
    );
    expect(result).toEqual([relGood]);

    expect(fs.readFileSync(path.join(downloadDir, 'good.png'), 'utf-8')).toBe(
      'gooddata',
    );

    expect(mockedCoreInfo).toHaveBeenCalledTimes(1);
    expect(mockedCoreWarning).toHaveBeenCalledTimes(1);
    expect(mockedCoreWarning).toHaveBeenCalledWith(
      expect.stringContaining(`Failed to download image ${badURL}`),
    );
  });
});
