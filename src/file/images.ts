/**
 * Image utilities module.
 *
 * Provides functions to extract image URLs from text and download images to a local directory.
 */
import * as fs from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as core from '@actions/core';

// Precompiled regular expressions for Markdown and HTML image tags
const mdRegex = /!\[[\s\S]*?\]\((https?:\/\/[^)]+)\)/g;
const htmlRegex = /<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/g;

/**
 * Extract image URLs from Markdown and HTML <img> tags in the given text.
 *
 * @param {string} text - Text to search for image URLs.
 * @returns {string[]} Array of unique image URLs.
 */
export function extractImageUrls(text: string): string[] {
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  mdRegex.lastIndex = 0;
  while ((match = mdRegex.exec(text)) !== null) {
    urls.push(match[1]);
  }
  htmlRegex.lastIndex = 0;
  while ((match = htmlRegex.exec(text)) !== null) {
    urls.push(match[1]);
  }
  return Array.from(new Set(urls));
}

/**
 * Download images from the given URLs into a local directory.
 *
 * @param {string[]} urls - Array of image URLs to download.
 * @param {string} downloadDir - Directory path where images will be saved.
 * @returns {Promise<string[]>} Array of relative file paths for downloaded images.
 */
export async function downloadImages(
  urls: string[],
  downloadDir: string,
): Promise<string[]> {
  await fsp.mkdir(downloadDir, { recursive: true });
  const downloaded: string[] = [];
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const filename = path.basename(parsed.pathname);
      const destPath = path.join(downloadDir, filename);
      await downloadFile(url, destPath);
      const stats = await fsp.stat(destPath);
      const fileSize = stats.size;
      downloaded.push(path.relative(process.cwd(), destPath));
      core.info(`Downloaded image ${url} to ${destPath} (${fileSize} bytes)`);
    } catch (err) {
      core.warning(
        `Failed to download image ${url}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  return downloaded;
}

/**
 * Download a remote file via HTTP(S) stream and save it locally.
 * @param url - Source file URL to fetch.
 * @param dest - Local filesystem path where the file will be written.
 * @returns Promise that resolves once the file has been fully written.
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return axios.get(url, { responseType: 'stream' }).then((response) => {
    return new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(dest);
      response.data.pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  });
}
