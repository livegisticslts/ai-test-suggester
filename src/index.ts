import { readFileSync } from "fs";
import * as core from "@actions/core";
import OpenAI from "openai";
import { Octokit } from "@octokit/rest";
import parseDiff, { Chunk, File } from "parse-diff";
import { minimatch } from "minimatch";

interface PRDetails {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  description: string | null;
}

interface GitHubEvent {
  repository: {
    owner: {
      login: string;
    };
    name: string;
  };
  number: number;
}

const octokit = new Octokit({ auth: core.getInput("GITHUB_TOKEN") });
const openai = new OpenAI({ apiKey: core.getInput("OPENAI_API_KEY") });
const model = core.getInput("OPENAI_API_MODEL") || "gpt-4";

async function getPRDetails(): Promise<PRDetails> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH environment variable is not set");
  }

  const eventData = JSON.parse(readFileSync(eventPath, "utf8")) as GitHubEvent;
  const { repository, number } = eventData;

  try {
    const pr = await octokit.pulls.get({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: number,
    });

    return {
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: number,
      title: pr.data.title,
      description: pr.data.body,
    };
  } catch (error) {
    throw new Error(`Failed to get PR details: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getDiff(owner: string, repo: string, pull_number: number): Promise<string> {
  try {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
      owner,
      repo,
      pull_number,
      headers: {
        accept: "application/vnd.github.v3.diff"
      }
    });
    return data.toString();
  } catch (error) {
    throw new Error(`Failed to get diff: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function createPrompt(file: File, chunk: Chunk, pr: PRDetails): string {
  return `You are a senior QA engineer. Suggest how someone should test the following code change—manually, with automation, or through exploratory testing.

Pull Request Title: ${pr.title}
Pull Request Description:
---
${pr.description || "No description provided"}
---

File: ${file.to}
\`\`\`diff
${chunk.content}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
${chunk.changes.map((c: any) => `${c.ln ?? c.ln2 ?? ""} ${c.content}`).join("\n")}
\`\`\`
Respond with clear bullet points.`;
}

async function getAIResponse(prompt: string): Promise<string> {
  try {
    const res = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [{ role: "system", content: prompt }],
    });
    return res.choices[0]?.message?.content?.trim() || "";
  } catch (error) {
    throw new Error(`Failed to get AI response: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function postComment(
  owner: string,
  repo: string,
  pr: number,
  body: string
): Promise<void> {
  try {
    await octokit.issues.createComment({ owner, repo, issue_number: pr, body });
  } catch (error) {
    throw new Error(`Failed to post comment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export default async function main(): Promise<void> {
  try {
    const pr = await getPRDetails();
    const diff = await getDiff(pr.owner, pr.repo, pr.pull_number);
    const parsed = parseDiff(diff);

    const excludePatterns = core
      .getInput("exclude")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const filtered = parsed.filter(
      (f) => !excludePatterns.some((pattern) => minimatch(f.to || "", pattern))
    );

    let suggestions = "";
    for (const file of filtered) {
      for (const chunk of file.chunks) {
        const prompt = createPrompt(file, chunk, pr);
        const aiText = await getAIResponse(prompt);
        suggestions += `### ${file.to}
${aiText}

`;
      }
    }

    if (suggestions) {
      await postComment(
        pr.owner,
        pr.repo,
        pr.pull_number,
        `**AI Suggestions: How to Test These Changes**

${suggestions}`
      );
    } else {
      core.info("No suggestions generated for the changes.");
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
