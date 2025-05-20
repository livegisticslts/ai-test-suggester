// @ts-nocheck
import { readFileSync } from "fs";
import * as core from "@actions/core";
import OpenAI from "openai";
import { Octokit } from "@octokit/rest";
import parseDiff, { Chunk, File } from "parse-diff";
import minimatch from "minimatch";

const octokit = new Octokit({ auth: core.getInput("GITHUB_TOKEN") });
const openai = new OpenAI({ apiKey: core.getInput("OPENAI_API_KEY") });
const model = core.getInput("OPENAI_API_MODEL") || "gpt-4";

async function getPRDetails() {
  const { repository, number } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8")
  );
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
}

async function getDiff(owner: string, repo: string, pull_number: number) {
  const { data } = await octokit.pulls.get({
    owner,
    repo,
    pull_number,
    mediaType: { format: "diff" },
  });
  return data as string;
}

function createPrompt(file: File, chunk: Chunk, pr: any): string {
  return `You are a senior QA engineer. Suggest test ideas for the following code change.

Pull Request Title: ${pr.title}
Pull Request Description:
---
${pr.description}
---

File: ${file.to}
\`\`\`diff
${chunk.content}
${chunk.changes.map((c) => `${c.ln ?? c.ln2} ${c.content}`).join("\n")}
\`\`\`
Respond with clear bullet points.`;
}

async function getAIResponse(prompt: string) {
  const res = await openai.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [{ role: "system", content: prompt }],
  });
  return res.choices[0].message?.content?.trim() || "";
}

async function postComment(
  owner: string,
  repo: string,
  pr: number,
  body: string
) {
  await octokit.issues.createComment({ owner, repo, issue_number: pr, body });
}

export default async function main() {
  const pr = await getPRDetails();
  const diff = await getDiff(pr.owner, pr.repo, pr.pull_number);
  const parsed = parseDiff(diff);
  const exclude = core
    .getInput("exclude")
    .split(",")
    .map((p) => p.trim());
  const filtered = parsed.filter(
    (f) => !exclude.some((pattern) => minimatch(f.to || "", pattern))
  );

  let suggestions = "";
  for (const file of filtered) {
    for (const chunk of file.chunks) {
      const prompt = createPrompt(file, chunk, pr);
      const aiText = await getAIResponse(prompt);
      suggestions += `### ${file.to}\n${aiText}\n\n`;
    }
  }

  if (suggestions) {
    await postComment(
      pr.owner,
      pr.repo,
      pr.pull_number,
      `**AI Suggestions: How to Test These Changes**\n\n${suggestions}`
    );
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  });
}
