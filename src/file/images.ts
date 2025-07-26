/**
 * @file Image utilities module.
 *
 * Provides functions to extract image URLs from text and download images to a local directory.
 */

import { createWriteStream, promises as fsPromises } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';

import * as core from '@actions/core';

import axios from 'axios';

/** RegExp to match Markdown-style image links (![alt](url)). */
const markdownImageRegex = /!\[[\s\S]*?\]\((https?:\/\/[^)]+)\)/g;
/** RegExp to match HTML <img> tags with src attribute. */
const htmlImageRegex = /<img[^>]*src=["'](https?:\/\/[^"']+)["'][^>]*>/g;

/**
 * Extract unique image URLs from Markdown and HTML <img> tags within text.
 * @param text - Text to search for image URLs.
 * @returns Array of unique image URLs.
 */
export function extractImageUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const match of text.matchAll(markdownImageRegex)) {
    urls.add(match[1]);
  }
  for (const match of text.matchAll(htmlImageRegex)) {
    urls.add(match[1]);
  }
  return Array.from(urls);
}

const DEFAULT_CONCURRENCY = 5;

/**
 * Download images from the given URLs into a local directory.
 * @param urls - Array of image URLs to download.
 * @param downloadDir - Directory path where images will be saved.
 * @param concurrency - Number of concurrent downloads (default: 5).
 * @returns Promise resolving to an array of relative file paths for downloaded images.
 */
export async function downloadImages(
  urls: string[],
  downloadDir: string,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<string[]> {
  await fsPromises.mkdir(downloadDir, { recursive: true });
  const results: (string | undefined)[] = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((url) => processImage(url, downloadDir)),
    );
    results.push(...batchResults);
  }
  return results.filter((p): p is string => p !== undefined);
}

/**
 * Process a single image URL: download it and return its relative file path.
 * @param url - URL of the image to download.
 * @param downloadDir - Local directory to save the image.
 * @returns Relative path of the downloaded image, or undefined if failed.
 */
async function processImage(url: string, downloadDir: string): Promise<string | undefined> {
  try {
    const { pathname } = new URL(url);
    const filename = path.basename(pathname);
    const destPath = path.join(downloadDir, filename);
    await downloadFile(url, destPath);
    const stats = await fsPromises.stat(destPath);
    core.info(`Downloaded image ${url} to ${destPath} (${stats.size} bytes)`);
    return path.relative(process.cwd(), destPath);
  } catch (err) {
    core.warning(`Failed to download image ${url}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

/**
 * Download a remote file via HTTP(S) stream and save it locally.
 * @param url - Source file URL to fetch.
 * @param dest - Local filesystem path where the file will be written.
 */
async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await axios.get<import('stream').Readable>(url, {
    responseType: 'stream',
  });
  await pipeline(response.data as import('stream').Readable, createWriteStream(dest));
}
