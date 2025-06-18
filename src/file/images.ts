import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as core from '@actions/core';

/**
 * Extracts image URLs from Markdown and HTML <img> tags in text.
 * @param text Text to search for image URLs.
 * @returns Array of unique image URLs.
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
 * Downloads images from the given URLs into a directory.
 * @param urls Array of image URLs to download.
 * @param downloadDir Directory path where images will be saved.
 * @returns Array of relative file paths for downloaded images.
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
      downloaded.push(path.relative(process.cwd(), destPath));
      core.info(`Downloaded image ${url} to ${destPath}`);
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
 * Helper to download a file from URL to destination path.
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Failed to download ${url}. Status code: ${response.statusCode}`));
        return;
      }
      const stream = fs.createWriteStream(dest);
      response.pipe(stream);
      stream.on('finish', () => stream.close(resolve));
    });
    request.on('error', (err) => reject(err));
  });
}