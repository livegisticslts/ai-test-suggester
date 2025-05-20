"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = main;
const fs_1 = require("fs");
const core = __importStar(require("@actions/core"));
const openai_1 = __importDefault(require("openai"));
const rest_1 = require("@octokit/rest");
const parse_diff_1 = __importDefault(require("parse-diff"));
const minimatch_1 = require("minimatch");
const octokit = new rest_1.Octokit({ auth: core.getInput("GITHUB_TOKEN") });
const openai = new openai_1.default({ apiKey: core.getInput("OPENAI_API_KEY") });
const model = core.getInput("OPENAI_API_MODEL") || "gpt-4";
async function getPRDetails() {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath) {
        throw new Error("GITHUB_EVENT_PATH environment variable is not set");
    }
    const eventData = JSON.parse((0, fs_1.readFileSync)(eventPath, "utf8"));
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
    }
    catch (error) {
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
    }
    catch (error) {
        throw new Error(`Failed to get diff: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function createPrompt(file, chunk, pr) {
    return `You are a senior QA engineer. Suggest how someone should test the following code change—manually, with automation, or through exploratory testing.

Pull Request Title: ${pr.title}
Pull Request Description:
---
${pr.description || "No description provided"}
---

File: ${file.to}
\`\`\`diff
${chunk.content}
${chunk.changes.map((c) => `${c.ln ?? c.ln2 ?? ""} ${c.content}`).join("\n")}
\`\`\`
Respond with clear bullet points.`;
}
async function getAIResponse(prompt) {
    try {
        const res = await openai.chat.completions.create({
            model,
            temperature: 0.3,
            messages: [{ role: "system", content: prompt }],
        });
        return res.choices[0]?.message?.content?.trim() || "";
    }
    catch (error) {
        throw new Error(`Failed to get AI response: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function postComment(owner, repo, pr, body) {
    try {
        await octokit.issues.createComment({ owner, repo, issue_number: pr, body });
    }
    catch (error) {
        throw new Error(`Failed to post comment: ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function main() {
    try {
        const pr = await getPRDetails();
        const diff = await getDiff(pr.owner, pr.repo, pr.pull_number);
        const parsed = (0, parse_diff_1.default)(diff);
        const excludePatterns = core
            .getInput("exclude")
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
        const filtered = parsed.filter((f) => !excludePatterns.some((pattern) => (0, minimatch_1.minimatch)(f.to || "", pattern)));
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
            await postComment(pr.owner, pr.repo, pr.pull_number, `**AI Suggestions: How to Test These Changes**

${suggestions}`);
        }
        else {
            core.info("No suggestions generated for the changes.");
        }
    }
    catch (error) {
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
