import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DemoGenerator } from '../src/DemoGenerator';

// Mock external dependencies
vi.mock('child_process');
vi.mock('fs');
vi.mock('path');
vi.mock('../src/ui/index.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }
}));

const mockedExecSync = vi.mocked(execSync);
const mockedFs = vi.mocked(fs);
const mockedPath = vi.mocked(path);

describe('DemoGenerator', () => {
  let demoGenerator: DemoGenerator;
  const mockCwd = '/mock/current/directory';
  const mockAssetsDir = '/mock/current/directory/assets';
  const mockScreenshotsDir = '/mock/current/directory/assets/screenshots';
  const mockGifsDir = '/mock/current/directory/assets/gifs';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock process.cwd()
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    
    // Mock path.join calls
    mockedPath.join
      .mockReturnValueOnce(mockAssetsDir) // assetsDir
      .mockReturnValueOnce(mockScreenshotsDir) // screenshotsDir
      .mockReturnValueOnce(mockGifsDir); // gifsDir
    
    // Mock fs.existsSync to return false initially (directories don't exist)
    mockedFs.existsSync.mockReturnValue(false);
    
    // Mock fs.mkdirSync
    mockedFs.mkdirSync.mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance and ensure directories exist', () => {
      demoGenerator = new DemoGenerator();

      expect(process.cwd).toHaveBeenCalledOnce();
      expect(mockedPath.join).toHaveBeenCalledWith(mockCwd, 'assets');
      expect(mockedPath.join).toHaveBeenCalledWith(mockAssetsDir, 'screenshots');
      expect(mockedPath.join).toHaveBeenCalledWith(mockAssetsDir, 'gifs');
      expect(mockedFs.existsSync).toHaveBeenCalledTimes(3);
      expect(mockedFs.mkdirSync).toHaveBeenCalledTimes(3);
    });

    it('should not create directories if they already exist', () => {
      mockedFs.existsSync.mockReturnValue(true);
      
      demoGenerator = new DemoGenerator();

      expect(mockedFs.existsSync).toHaveBeenCalledTimes(3);
      expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should create directories with recursive option', () => {
      demoGenerator = new DemoGenerator();

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(mockAssetsDir, { recursive: true });
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(mockScreenshotsDir, { recursive: true });
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(mockGifsDir, { recursive: true });
    });
  });

  describe('generateAll', () => {
    beforeEach(() => {
      demoGenerator = new DemoGenerator();
      
      // Reset path.join mock for subsequent calls in methods
      mockedPath.join.mockClear();
    });

    it('should generate all demo assets successfully', async () => {
      const { logger } = await import('../src/ui/index.js');
      
      // Mock path.join for script file paths
      mockedPath.join
        .mockReturnValueOnce('/mock/path/quickstart-demo.sh')
        .mockReturnValueOnce('/mock/path/workflow-demo.sh')
        .mockReturnValueOnce('/mock/path/structure-demo.sh')
        .mockReturnValueOnce('/mock/path/architecture.md');

      mockedFs.writeFileSync.mockImplementation(() => undefined);
      mockedFs.chmodSync.mockImplementation(() => undefined);

      await demoGenerator.generateAll();

      expect(logger.info).toHaveBeenCalledWith('Generating demo assets...');
      expect(logger.success).toHaveBeenCalledWith('Demo assets generated successfully!');
      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(4); // 3 scripts + 1 diagram
      expect(mockedFs.chmodSync).toHaveBeenCalledTimes(3); // 3 executable scripts
    });

    it('should handle errors and rethrow them', async () => {
      const { logger } = await import('../src/ui/index.js');
      const testError = new Error('File write failed');
      
      mockedPath.join.mockReturnValueOnce('/mock/path/quickstart-demo.sh');
      mockedFs.writeFileSync.mockImplementation(() => {
        throw testError;
      });

      await expect(demoGenerator.generateAll()).rejects.toThrow('File write failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to generate demo assets:', testError);
    });

    it('should log info message at the start', async () => {
      const { logger } = await import('../src/ui/index.js');
      
      mockedPath.join
        .mockReturnValueOnce('/mock/path/quickstart-demo.sh')
        .mockReturnValueOnce('/mock/path/workflow-demo.sh')
        .mockReturnValueOnce('/mock/path/structure-demo.sh')
        .mockReturnValueOnce('/mock/path/architecture.md');

      await demoGenerator.generateAll();

      expect(logger.info).toHaveBeenCalledWith('Generating demo assets...');
    });
  });

  describe('captureQuickStart', () => {
    beforeEach(() => {
      demoGenerator = new DemoGenerator();
      mockedPath.join.mockClear();
    });

    it('should create quickstart demo script', async () => {
      const { logger } = await import('../src/ui/index.js');
      const mockScriptPath = '/mock/path/quickstart-demo.sh';
      
      mockedPath.join.mockReturnValueOnce(mockScriptPath);

      // Access private method for testing
      await (demoGenerator as any).captureQuickStart();

      expect(mockedPath.join).toHaveBeenCalledWith(mockAssetsDir, 'quickstart-demo.sh');
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        mockScriptPath,
        expect.stringContaining('#!/bin/bash')
      );
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        mockScriptPath,
        expect.stringContaining('Miyabi - Beauty in Autonomous Development')
      );
      expect(mockedFs.chmodSync).toHaveBeenCalledWith(mockScriptPath, '755');
      expect(logger.info).toHaveBeenCalledWith('Quick start demo script generated');
    });

    it('should include expected commands in script', async () => {
      const mockScriptPath = '/mock/path/quickstart-demo.sh';
      mockedPath.join.mockReturnValueOnce(mockScriptPath);

      await (demoGenerator as any).captureQuickStart();

      const scriptContent = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(scriptContent).toContain('npx miyabi --help');
      expect(scriptContent).toContain('npx miyabi init demo-project');
      expect(scriptContent).toContain('cd demo-project && npx miyabi');
    });
  });

  describe('captureAgentWorkflow', () => {
    beforeEach(() => {
      demoGenerator = new DemoGenerator();
      mockedPath.join.mockClear();
    });

    it('should create agent workflow demo script', async () => {
      const { logger } = await import('../src/ui/index.js');
      const mockScriptPath = '/mock/path/workflow-demo.sh';
      
      mockedPath.join.mockReturnValueOnce(mockScriptPath);

      await (demoGenerator as any).captureAgentWorkflow();

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        mockScriptPath,
        expect.stringContaining('#!/bin/bash')
      );
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        mockScriptPath,
        expect.stringContaining('Miyabi AI Agents in Action')
      );
      expect(mockedFs.chmodSync).toHaveBeenCalledWith(mockScriptPath, '755');
      expect(logger.info).toHaveBeenCalledWith('Agent workflow demo script generated');
    });

    it('should include agent collaboration steps', async () => {
      const mockScriptPath = '/mock/path/workflow-demo.sh';
      mockedPath.join.mockReturnValueOnce(mockScriptPath);

      await (demoGenerator as any).captureAgentWorkflow();

      const scriptContent = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(scriptContent).toContain('PlannerAgent');
      expect(scriptContent).toContain('DeveloperAgent');
      expect(scriptContent).toContain('ReviewerAgent');
      expect(scriptContent).toContain('TestAgent');
      expect(scriptContent).toContain('DocumentationAgent');
    });
  });

  describe('captureProjectStructure', () => {
    beforeEach(() => {
      demoGenerator = new DemoGenerator();
      mockedPath.join.mockClear();
    });

    it('should create project structure demo script', async () => {
      const { logger } = await import('../src/ui/index.js');
      const mockScriptPath = '/mock/path/structure-demo.sh';
      
      mockedPath.join.mockReturnValueOnce(mockScriptPath);

      await (demoGenerator as any).captureProjectStructure();

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        mockScriptPath,
        expect.stringContaining('Miyabi Generated Project Structure')
      );
      expect(mockedFs.chmodSync).toHaveBeenCalledWith(mockScriptPath, '755');
      expect(logger.info).toHaveBeenCalledWith('Project structure demo script generated');
    });

    it('should include tree command and file descriptions', async () => {
      const mockScriptPath = '/mock/path/structure-demo.sh';
      mockedPath.join.mockReturnValueOnce(mockScriptPath);

      await (demoGenerator as any).captureProjectStructure();

      const scriptContent = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(scriptContent).toContain('tree -I \'node_modules|.git\' -L 3');
      expect(scriptContent).toContain('README.md');
      expect(scriptContent).toContain('package.json');
      expect(scriptContent).toContain('tsconfig.json');
    });
  });

  describe('generateArchitectureDiagram', () => {
    beforeEach(() => {
      demoGenerator = new DemoGenerator();
      mockedPath.join.mockClear();
    });

    it('should create architecture diagram', async () => {
      const { logger } = await import('../src/ui/index.js');
      const mockDiagramPath = '/mock/path/architecture.md';
      
      mockedPath.join.mockReturnValueOnce(mockDiagramPath);

      await (demoGenerator as any).generateArchitectureDiagram();

      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        mockDiagramPath,
        expect.stringContaining('# Miyabi Architecture Overview')
      );
      expect(logger.info).toHaveBeenCalledWith('Architecture diagram generated');
    });

    it('should include mermaid diagrams', async () => {
      const mockDiagramPath = '/mock/path/architecture.md';
      mockedPath.join.mockReturnValueOnce(mockDiagramPath);

      await (demoGenerator as any).generateArchitectureDiagram();

      const diagramContent = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(diagramContent).toContain('```mermaid');
      expect(diagramContent).toContain('graph TD');
    });
  });
});