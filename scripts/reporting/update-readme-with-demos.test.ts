import { describe, it, expect, vi, beforeEach, afterEach, MockedFunction } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ReadmeUpdater } from './ReadmeUpdater';

// Mock external dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('../src/ui/index.js', () => ({
  logger: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }
}));

// Import mocked logger
import { logger } from '../src/ui/index';

const mockedFs = vi.mocked(fs);
const mockedPath = vi.mocked(path);
const mockedLogger = vi.mocked(logger);

describe('ReadmeUpdater', () => {
  let readmeUpdater: ReadmeUpdater;
  const mockReadmePath = '/mock/path/README.md';
  const mockCwd = '/mock/path';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup path mocks
    mockedPath.join.mockImplementation((...paths) => paths.join('/'));
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    
    readmeUpdater = new ReadmeUpdater();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct paths', () => {
      expect(mockedPath.join).toHaveBeenCalledWith(mockCwd, 'README.md');
      expect(readmeUpdater).toBeInstanceOf(ReadmeUpdater);
    });
  });

  describe('updateReadme', () => {
    const mockReadmeContent = `# Test Project
![Demo](https://img.shields.io/badge/Demo-Coming%20Soon-orange?style=for-the-badge)

## 🎯 English
<details>
<summary>English Documentation</summary>

Some content here.

</details>
`;

    beforeEach(() => {
      mockedFs.readFileSync.mockReturnValue(mockReadmeContent);
      mockedFs.writeFileSync.mockImplementation(() => {});
    });

    it('should successfully update README with demo content', () => {
      readmeUpdater.updateReadme();

      expect(mockedFs.readFileSync).toHaveBeenCalledWith(mockReadmePath, 'utf-8');
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        `${mockReadmePath}.backup`, 
        mockReadmeContent
      );
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        mockReadmePath,
        expect.stringContaining('## 🎬 デモンストレーション')
      );
      expect(mockedLogger.success).toHaveBeenCalledWith('README.md updated with demo content');
    });

    it('should create backup file before updating', () => {
      readmeUpdater.updateReadme();

      expect(mockedFs.writeFileSync).toHaveBeenNthCalledWith(
        1,
        `${mockReadmePath}.backup`,
        mockReadmeContent
      );
    });

    it('should handle file read errors', () => {
      const error = new Error('File not found');
      mockedFs.readFileSync.mockImplementation(() => {
        throw error;
      });

      expect(() => readmeUpdater.updateReadme()).toThrow(error);
      expect(mockedLogger.error).toHaveBeenCalledWith('Failed to update README:', error);
    });

    it('should handle file write errors', () => {
      const error = new Error('Permission denied');
      mockedFs.writeFileSync.mockImplementation(() => {
        throw error;
      });

      expect(() => readmeUpdater.updateReadme()).toThrow(error);
      expect(mockedLogger.error).toHaveBeenCalledWith('Failed to update README:', error);
    });

    it('should replace demo placeholder with actual demo section', () => {
      readmeUpdater.updateReadme();

      const updatedContent = (mockedFs.writeFileSync as MockedFunction<any>).mock.calls
        .find(call => call[0] === mockReadmePath)?.[1];

      expect(updatedContent).toContain('## 🎬 デモンストレーション');
      expect(updatedContent).toContain('### クイックスタート');
      expect(updatedContent).toContain('assets/gifs/quickstart-demo.gif');
      expect(updatedContent).not.toContain('![Demo](https://img.shields.io/badge/Demo-Coming%20Soon-orange?style=for-the-badge)');
    });

    it('should add English demo section after English header', () => {
      readmeUpdater.updateReadme();

      const updatedContent = (mockedFs.writeFileSync as MockedFunction<any>).mock.calls
        .find(call => call[0] === mockReadmePath)?.[1];

      expect(updatedContent).toContain('## 🎬 Demonstrations');
      expect(updatedContent).toContain('### Quick Start');
      expect(updatedContent).toContain('*Autonomous development begins with a single command*');
    });

    it('should handle content without English section gracefully', () => {
      const contentWithoutEnglish = `# Test Project
![Demo](https://img.shields.io/badge/Demo-Coming%20Soon-orange?style=for-the-badge)

Some other content.
`;
      mockedFs.readFileSync.mockReturnValue(contentWithoutEnglish);

      expect(() => readmeUpdater.updateReadme()).not.toThrow();
      
      const updatedContent = (mockedFs.writeFileSync as MockedFunction<any>).mock.calls
        .find(call => call[0] === mockReadmePath)?.[1];

      expect(updatedContent).toContain('## 🎬 デモンストレーション');
    });
  });

  describe('generateDemoBadges', () => {
    it('should generate correct demo badges', () => {
      const badges = readmeUpdater.generateDemoBadges();

      expect(badges).toContain('[![Demo: Quick Start]');
      expect(badges).toContain('[![Demo: AI Agents]');
      expect(badges).toContain('[![Demo: Project Gen]');
      expect(badges).toContain('assets/gifs/quickstart-demo.gif');
      expect(badges).toContain('assets/gifs/workflow-demo.gif');
      expect(badges).toContain('assets/gifs/structure-demo.gif');
      expect(badges).toContain('style=for-the-badge');
    });

    it('should return string with proper formatting', () => {
      const badges = readmeUpdater.generateDemoBadges();

      expect(badges).toMatch(/^\n.*\n$/s); // Starts and ends with newlines
      expect(badges.split('\n')).toHaveLength(5); // Should have 5 lines (including empty ones)
    });
  });

  describe('createAssetStructure', () => {
    beforeEach(() => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockImplementation(() => '');
      mockedFs.writeFileSync.mockImplementation(() => {});
    });

    it('should create all required directories', () => {
      readmeUpdater.createAssetStructure();

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith('assets/screenshots', { recursive: true });
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith('assets/gifs', { recursive: true });
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith('assets/diagrams', { recursive: true });
      expect(mockedLogger.info).toHaveBeenCalledTimes(3);
    });

    it('should skip creating existing directories', () => {
      mockedFs.existsSync.mockReturnValue(true);

      readmeUpdater.createAssetStructure();

      expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
      expect(mockedLogger.info).not.toHaveBeenCalled();
    });

    it('should create assets README file', () => {
      readmeUpdater.createAssetStructure();

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        'assets/README.md',
        expect.stringContaining('# Miyabi Demo Assets')
      );
    });

    it('should log success message', () => {
      readmeUpdater.createAssetStructure();

      expect(mockedLogger.success).toHaveBeenCalledWith('Asset directory structure created');
    });

    it('should handle mixed existing/non-existing directories', () => {
      mockedFs.existsSync.mockImplementation((dirPath) => {
        return dirPath === 'assets/screenshots';
      });

      readmeUpdater.createAssetStructure();

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith('assets/gifs', { recursive: true });
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith('assets/diagrams', { recursive: true });
      expect(mockedFs.mkdirSync).not.toHaveBeenCalledWith('assets/screenshots', expect.any(Object));
      expect(mockedLogger.info).toHaveBeenCalledTimes(2);
    });

    it('should create comprehensive asset README with all sections', () => {
      readmeUpdater.createAssetStructure();

      const readmeCall = (mockedFs.writeFileSync as MockedFunction<any>).mock.calls
        .find(call => call[0] === 'assets/README.md');

      expect(readmeCall).toBeDefined();
      const readmeContent = readmeCall[1];

      expect(readmeContent).toContain('# Miyabi Demo Assets');
      expect(readmeContent).toContain('## Contents');
      expect(readmeContent).toContain('### Screenshots (/screenshots)');
      expect(readmeContent).toContain('### GIFs (/gifs)');
      expect(readmeContent).toContain('### Diagrams (/diagrams)');
      expect(readmeContent).toContain('## Recording Guidelines');
      expect(readmeContent).toContain('## Tools');
      expect(readmeContent).toContain('cli-help.png');
      expect(readmeContent).toContain('quickstart-demo.gif');
    });
  });

  describe('insertDemoContent', () => {
    it('should replace demo placeholder with Japanese demo section', () => {
      const content = `# Test
![Demo](https://img.shields.io/badge/Demo-Coming%20Soon-orange?style=for-the-badge)
More content`;

      // Access private method through type assertion
      const result = (readmeUpdater as any).insertDemoContent(content);

      expect(result).toContain('## 🎬 デモンストレーション');
      expect(result).toContain('### クイックスタート');
      expect(result).not.toContain('![Demo](https://img.shields.io/badge/Demo-Coming%20Soon-orange?style=for-the-badge)');
    });

    it('should add English demo section when English header exists', () => {
      const content = `# Test
![Demo](https://img.shields.io/badge/Demo-Coming%20Soon-orange?style=for-the-badge)

## 🎯 English
<details>
<summary>Click to expand</summary>

Content here
</details>`;

      const result = (readmeUpdater as any).insertDemoContent(content);

      expect(result).toContain('## 🎬 Demonstrations');
      expect(result).toContain('### Quick Start');
      expect(result).toContain('*Autonomous development begins with a single command*');
    });

    it('should handle content without demo placeholder', () => {
      const content = `# Test
Some content without placeholder`;

      const result = (readmeUpdater as any).insertDemoContent(content);

      expect(result).toBe(content); // Should return unchanged
    });

    it('should include mermaid diagram in demo content', () => {
      const content = `# Test
![Demo](https://img.shields.io/badge/Demo-Coming%20Soon-orange?style=for-the-badge)`;

      const result = (readmeUpdater as any).insertDemoContent(content);

      expect(result).toContain('```mermaid');
      expect(result).toContain('graph LR');
    });
  });
});