# AI Test Suggester

A GitHub Action that automatically suggests test cases for pull requests using OpenAI's GPT models.

## Features

- Analyzes pull request changes
- Generates test suggestions using AI
- Posts suggestions as PR comments
- Configurable file exclusions
- Supports multiple AI models

## Usage

Add the following to your GitHub Actions workflow:

```yaml
name: AI Test Suggestions

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  suggest-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/ai-test-suggester@v1
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_API_MODEL: gpt-4  # Optional, defaults to gpt-4
          exclude: "*.md,*.txt"    # Optional, comma-separated patterns
```

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `GITHUB_TOKEN` | GitHub token for authentication | Yes | - |
| `OPENAI_API_KEY` | OpenAI API key for generating suggestions | Yes | - |
| `OPENAI_API_MODEL` | OpenAI model to use | No | gpt-4 |
| `exclude` | Comma-separated list of file patterns to exclude | No | "" |

## Development

### Prerequisites

- Node.js 20 or later
- npm 9 or later

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Available Scripts

- `npm run build` - Build the TypeScript code
- `npm run test` - Run tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types

### Testing

The project uses Jest for testing. Run tests with:

```bash
npm test
```

### Building

Build the project with:

```bash
npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT
