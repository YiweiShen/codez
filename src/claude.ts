import * as core from '@actions/core';
import Anthropic from '@anthropic-ai/sdk';

const claudeTinyModel = 'claude-3-5-haiku-20241022';

/**
 * Function to generate Git commit messages using Anthropic API
 * @param apiKey Anthropic API Key
 * @param changedFiles List of changed files
 * @param userPrompt User's original prompt to Claude
 * @param context Context information (PR number, Issue number, etc.)
 * @returns Generated commit message
 */
export async function generateCommitMessage(
  apiKey: string,
  changedFiles: string[],
  userPrompt: string,
  context: { prNumber?: number; issueNumber?: number; }
): Promise<string> {
  try {
    // Create prompt
    let prompt = `Based on the following file changed and User Request, generate a concise and clear git commit message.
The commit message should follow this format:
* Summary of changes (50 characters or less). Please do not include any other text.

User Request:
${userPrompt}

files changed:
\`\`\`
${changedFiles.join('\n')}
\`\`\``;

    // Add context information if available
    if (context.prNumber) {
      prompt += `\n\nThis change is related to PR #${context.prNumber}.`;
    }
    if (context.issueNumber) {
      prompt += `\n\nThis change is related to Issue #${context.issueNumber}.`;
    }

    // Call Anthropic API
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    const response = await anthropic.messages.create({
      model: claudeTinyModel,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract commit message from response
    let commitMessage = '';
    if (response.content.length > 0 && response.content[0].type === 'text') {
        commitMessage = response.content[0].text;
    }
    commitMessage = commitMessage.trim().split('\n')[0]; // Take the first line

    // Fallback if the message is empty or too long
    if (!commitMessage || commitMessage.length > 100) {
        core.warning(`Generated commit message was empty or too long: "${commitMessage}". Falling back.`);
        throw new Error("Generated commit message invalid."); // Trigger fallback
    }


    core.info(`Generated commit message: ${commitMessage}`);
    return commitMessage;
  } catch (error) {
    core.warning(`Error generating commit message: ${error instanceof Error ? error.message : String(error)}. Using fallback.`);
    // Return default message in case of error
    if (context.prNumber) {
      return `Apply changes for PR #${context.prNumber}`;
    } else if (context.issueNumber) {
      return `Apply changes for Issue #${context.issueNumber}`;
    } else {
      // Generic fallback if no context number is available
      const fileCount = changedFiles.length;
      return `Apply changes to ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
    }
  }
}