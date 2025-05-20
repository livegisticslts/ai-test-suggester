# AI Test Suggestion GitHub Action

This GitHub Action uses OpenAI's GPT model to review pull request diffs and suggest how to test them.

## Inputs

| Input              | Required | Description                 |
| ------------------ | -------- | --------------------------- |
| `GITHUB_TOKEN`     | ✅       | GitHub token for API access |
| `OPENAI_API_KEY`   | ✅       | OpenAI API key              |
| `OPENAI_API_MODEL` | ❌       | Default: `gpt-4`            |
| `exclude`          | ❌       | Glob patterns to exclude    |

## Usage

```yaml
- uses: my-org/ai-test-suggester@main
  with:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Output

Posts a PR comment like:

```md
🧪 **AI Test Suggestions**

### src/payment.ts

- Add unit test for currency rounding.
- Simulate edge case for invalid exchange rates.
```
