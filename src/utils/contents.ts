export function genContentsString(content: {
  body: string;
  login: string;
}): string {
  let body = content.body.trim();
  const login = content.login.trim();
  if (!body) {
    return '';
  }

  if (login === 'github-actions[bot]') {
    // Add ">" to the beginning of the body, considering line breaks
    body = body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    return body + '\n\n';
  }

  return '';
}

export function genFullContentsString(content: { body: string; login: string }): string {
  const body = content.body.trim();
  if (!body) {
    return '';
  }
  const formatted = body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return formatted + '\n\n';
}
