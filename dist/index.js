"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => main
});
module.exports = __toCommonJS(index_exports);
var import_fs = require("fs");
var core = __toESM(require("@actions/core"));
var import_openai = __toESM(require("openai"));
var import_rest = require("@octokit/rest");
var import_parse_diff = __toESM(require("parse-diff"));
var import_minimatch = require("minimatch");
var octokit = new import_rest.Octokit({ auth: core.getInput("GITHUB_TOKEN") });
var openai = new import_openai.default({ apiKey: core.getInput("OPENAI_API_KEY") });
var model = core.getInput("OPENAI_API_MODEL") || "gpt-4";
async function getPRDetails() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH environment variable is not set");
  }
  const eventData = JSON.parse((0, import_fs.readFileSync)(eventPath, "utf8"));
  const { repository, number } = eventData;
  try {
    const pr = await octokit.pulls.get({
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: number
    });
    return {
      owner: repository.owner.login,
      repo: repository.name,
      pull_number: number,
      title: pr.data.title,
      description: pr.data.body
    };
  } catch (error) {
    throw new Error(`Failed to get PR details: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function getDiff(owner, repo, pull_number) {
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
function createPrompt(file, chunk, pr) {
  return `You are a senior QA engineer. Suggest how someone should test the following code change\u2014manually, with automation, or through exploratory testing.

Pull Request Title: ${pr.title}
Pull Request Description:
---
${pr.description || "No description provided"}
---

File: ${file.to}
\`\`\`diff
${chunk.content}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
${chunk.changes.map((c) => `${c.ln ?? c.ln2 ?? ""} ${c.content}`).join("\n")}
\`\`\`
Respond with clear bullet points.`;
}
async function getAIResponse(prompt) {
  try {
    const res = await openai.chat.completions.create({
      model,
      temperature: 0.3,
      messages: [{ role: "system", content: prompt }]
    });
    return res.choices[0]?.message?.content?.trim() || "";
  } catch (error) {
    throw new Error(`Failed to get AI response: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function postComment(owner, repo, pr, body) {
  try {
    await octokit.issues.createComment({ owner, repo, issue_number: pr, body });
  } catch (error) {
    throw new Error(`Failed to post comment: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function main() {
  try {
    const pr = await getPRDetails();
    const diff = await getDiff(pr.owner, pr.repo, pr.pull_number);
    const parsed = (0, import_parse_diff.default)(diff);
    const excludePatterns = core.getInput("exclude").split(",").map((p) => p.trim()).filter(Boolean);
    const filtered = parsed.filter(
      (f) => !excludePatterns.some((pattern) => (0, import_minimatch.minimatch)(f.to || "", pattern))
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
