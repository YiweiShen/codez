export function genContentsString(content: { body: string; login: string }, userPrompt: string): string {
  let body = content.body.trim();
  const login = content.login.trim();
  if (!body) {
    return "";
  }

  if (body.startsWith("/claude")) {
    // Remove "/claude" from the beginning of the body
    body = body.substring(body.indexOf('/claude') + '/claude'.length).trim();
    if (body === userPrompt) {
      return "";
    }
    return body + "\n\n";
  }

  if (login === 'github-actions[bot]') {
    // Add ">" to the beginning of the body, considering line breaks
    body = body.split("\n").map(line => `> ${line}`).join("\n");
    return body + "\n\n";
  }

  return "";
}
