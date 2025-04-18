import * as core from '@actions/core';
import OpenAI, { ClientOptions } from 'openai';
import { ActionConfig } from '../config/config.js';

const defaultModel = 'o4-mini';

function getOpenAIClient(config: ActionConfig): OpenAI {
  const openaiOptions: ClientOptions = {
    apiKey: config.openaiApiKey,
  };
  // Set base URL if provided
  if (config.openaiBaseUrl) { 
    openaiOptions.baseURL = config.openaiBaseUrl;
  }
  return new OpenAI(openaiOptions);
}

/**
 * Function to generate Git commit messages using OpenAI API
 * @param changedFiles List of changed files
 * @param userPrompt User's original prompt
 * @param context Context information (PR number, Issue number, etc.)
 * @param config Optional ActionConfig for additional settings
 * @returns Generated commit message
 */
export async function generateCommitMessage(
  changedFiles: string[],
  userPrompt: string,
  context: { prNumber?: number; issueNumber?: number; },
  config: ActionConfig
): Promise<string> {
  try {
    // Create prompt - System prompt + User prompt structure
    const systemPrompt = `Based on the following file changed and User Request, generate a concise and clear git commit message.
The commit message should follow this format:
* Summary of changes (50 characters or less). Please do not include any other text.`;

    let userContent = `User Request:
${userPrompt}

files changed:
\`\`\`
${changedFiles.join('\n')}
\`\`\``;

    // Add context information if available
    if (context.prNumber) {
      userContent += `\n\nThis change is related to PR #${context.prNumber}.`;
    }
    if (context.issueNumber) {
      userContent += `\n\nThis change is related to Issue #${context.issueNumber}.`;
    }

    const openai = getOpenAIClient(config);

    const response = await openai.chat.completions.create({
      model: defaultModel,
      max_tokens: 256,
      temperature: 0.7, // Standard temperature
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
    });

    // Extract commit message from response
    let commitMessage = response.choices[0]?.message?.content?.trim() || '';
    commitMessage = commitMessage.split('\n')[0]; // Take the first line

    // Fallback if the message is empty or too long (adjust length check if needed)
    if (!commitMessage || commitMessage.length > 100) { // Keep 100 char limit for safety
      core.warning(`Generated commit message was empty or too long: "${commitMessage}". Falling back.`);
      throw new Error("Generated commit message invalid."); // Trigger fallback
    }

    core.info(`Generated commit message: ${commitMessage}`);
    return commitMessage;
  } catch (error) {
    core.warning(`Error generating commit message with OpenAI: ${error instanceof Error ? error.message : String(error)}. Using fallback.`);
    // Return default message in case of error (same fallback logic as claude.ts)
    if (context.prNumber) {
      return `Apply changes for PR #${context.prNumber}`;
    } else if (context.issueNumber) {
      return `Apply changes for Issue #${context.issueNumber}`;
    } else {
      const fileCount = changedFiles.length;
      return `Apply changes to ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
    }
  }
}
