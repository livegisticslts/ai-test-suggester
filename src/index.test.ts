import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import * as core from '@actions/core';
import main from './index';

// Mock dependencies
jest.mock('@octokit/rest');
jest.mock('openai');
jest.mock('@actions/core');
jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(JSON.stringify({
    repository: {
      owner: { login: 'test-owner' },
      name: 'test-repo'
    },
    number: 123
  }))
}));

describe('AI Test Suggester', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GITHUB_EVENT_PATH = '/test/path';
  });

  it('should process PR and generate suggestions', async () => {
    // Mock Octokit responses
    const mockOctokit = {
      pulls: {
        get: jest.fn().mockResolvedValue({
          data: {
            title: 'Test PR',
            body: 'Test description'
          }
        })
      },
      issues: {
        createComment: jest.fn().mockResolvedValue({})
      }
    };
    (Octokit as jest.Mock).mockImplementation(() => mockOctokit);

    // Mock OpenAI response
    const mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'Test suggestion'
              }
            }]
          })
        }
      }
    };
    (OpenAI as jest.Mock).mockImplementation(() => mockOpenAI);

    // Mock core inputs
    (core.getInput as jest.Mock).mockImplementation((name: string) => {
      switch (name) {
        case 'GITHUB_TOKEN':
          return 'test-token';
        case 'OPENAI_API_KEY':
          return 'test-api-key';
        default:
          return '';
      }
    });

    await main();

    expect(mockOctokit.pulls.get).toHaveBeenCalled();
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    expect(mockOctokit.issues.createComment).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    const mockError = new Error('Test error');
    (Octokit as jest.Mock).mockImplementation(() => ({
      pulls: {
        get: jest.fn().mockRejectedValue(mockError)
      }
    }));

    await expect(main()).rejects.toThrow('Failed to get PR details');
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Test error'));
  });
}); 