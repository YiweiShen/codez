/**
 * Image utilities module.
 *
 * Provides functions to extract image URLs from text and download images to a local directory.
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as core from '@actions/core';

/**
 * Extract image URLs from Markdown and HTML <img> tags in the given text.
 *
 * @param {string} text - Text to search for image URLs.
 * @returns {string[]} Array of unique image URLs.
 */
export function extractImageUrls(text: string): string[] {
  const urls: string[] = [];
  const mdRegex = /!\[[\s\S]*?\]\((https?:\/\/[^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = mdRegex.exec(text)) !== null) {
    urls.push(match[1]);
  }
  const htmlRegex = /<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/g;
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
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }
  const downloaded: string[] = [];
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const filename = path.basename(parsed.pathname);
      const destPath = path.join(downloadDir, filename);
      await downloadFile(url, destPath);
      const stats = fs.statSync(destPath);
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
 * Download a file from a URL to the specified destination path.
 *
 * @param {string} url - The URL of the file to download.
 * @param {string} dest - Destination file path.
 * @returns {Promise<void>} Promise that resolves when the download completes.
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return axios.get(url, { responseType: 'stream' }).then(response => {
    return new Promise<void>((resolve, reject) => {
      const stream = fs.createWriteStream(dest);
      response.data.pipe(stream);
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  });
}