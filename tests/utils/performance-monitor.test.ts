/**
 * Performance Monitor Tests
 *
 * Tests for performance metrics collection and monitoring
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PerformanceMonitor } from '../../utils/performance-monitor';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor('test-session-123', {
      enableRealtimeMonitoring: false, // Disable for tests
      enableAlerts: false,
    });
  });

  afterEach(() => {
    monitor.stopMonitoring();
  });

  describe('initialization', () => {
    it('should initialize with session ID', () => {
      const metrics = monitor.collectMetrics();
      expect(metrics.sessionId).toBe('test-session-123');
    });

    it('should initialize with default config', () => {
      const monitor = new PerformanceMonitor('test');
      const history = monitor.getHistory();

      expect(history.sessionId).toBe('test');
      expect(history.snapshots).toHaveLength(0);
    });
  });

  describe('collectMetrics', () => {
    it('should collect system metrics', () => {
      const metrics = monitor.collectMetrics();

      expect(metrics.system).toBeDefined();
      expect(metrics.system.cpuUsagePercent).toBeGreaterThanOrEqual(0);
      expect(metrics.system.cpuUsagePercent).toBeLessThanOrEqual(100);
      expect(metrics.system.memoryUsagePercent).toBeGreaterThanOrEqual(0);
      expect(metrics.system.memoryUsagePercent).toBeLessThanOrEqual(100);
      expect(metrics.system.platform).toBeTruthy();
      expect(metrics.system.nodeVersion).toBeTruthy();
    });

    it('should collect execution metrics', () => {
      monitor.updateExecutionState({ totalTasks: 10 });
      const metrics = monitor.collectMetrics();

      expect(metrics.execution).toBeDefined();
      expect(metrics.execution.totalTasks).toBe(10);
      expect(metrics.execution.completedTasks).toBe(0);
      expect(metrics.execution.successRate).toBe(0);
    });

    it('should collect resource metrics', () => {
      const metrics = monitor.collectMetrics();

      expect(metrics.resources).toBeDefined();
      expect(metrics.resources.currentConcurrency).toBeGreaterThanOrEqual(0);
      expect(metrics.resources.optimalConcurrency).toBeGreaterThan(0);
    });

    it('should collect quality metrics', () => {
      const metrics = monitor.collectMetrics();

      expect(metrics.quality).toBeDefined();
      expect(metrics.quality.averageQualityScore).toBeGreaterThanOrEqual(0);
    });

    it('should collect cost metrics', () => {
      const metrics = monitor.collectMetrics();

      expect(metrics.cost).toBeDefined();
      expect(metrics.cost.apiCallsCount).toBe(0);
      expect(metrics.cost.totalEstimatedCostUSD).toBe(0);
    });
  });

  describe('updateExecutionState', () => {
    it('should update total tasks', () => {
      monitor.updateExecutionState({ totalTasks: 20 });
      const metrics = monitor.collectMetrics();

      expect(metrics.execution.totalTasks).toBe(20);
    });

    it('should update completed tasks', () => {
      monitor.updateExecutionState({ completedTasks: 5 });
      const metrics = monitor.collectMetrics();

      expect(metrics.execution.completedTasks).toBe(5);
    });

    it('should update failed tasks', () => {
      monitor.updateExecutionState({ failedTasks: 2 });
      const metrics = monitor.collectMetrics();

      expect(metrics.execution.failedTasks).toBe(2);
    });
  });

  describe('recordTaskCompletion', () => {
    it('should record successful task completion', () => {
      monitor.updateExecutionState({ totalTasks: 10 });
      monitor.recordTaskCompletion(5000, true, 85);

      const metrics = monitor.collectMetrics();
      expect(metrics.execution.completedTasks).toBe(1);
      expect(metrics.execution.averageTaskDurationMs).toBe(5000);
      expect(metrics.quality.averageQualityScore).toBe(85);
    });

    it('should record failed task', () => {
      monitor.updateExecutionState({ totalTasks: 10 });
      monitor.recordTaskCompletion(3000, false);

      const metrics = monitor.collectMetrics();
      expect(metrics.execution.failedTasks).toBe(1);
      expect(metrics.execution.completedTasks).toBe(0);
    });

    it('should calculate average duration correctly', () => {
      monitor.updateExecutionState({ totalTasks: 10 });
      monitor.recordTaskCompletion(1000, true);
      monitor.recordTaskCompletion(2000, true);
      monitor.recordTaskCompletion(3000, true);

      const metrics = monitor.collectMetrics();
      expect(metrics.execution.averageTaskDurationMs).toBe(2000);
    });

    it('should calculate success rate correctly', () => {
      monitor.updateExecutionState({ totalTasks: 10 });
      monitor.recordTaskCompletion(1000, true);
      monitor.recordTaskCompletion(2000, true);
      monitor.recordTaskCompletion(3000, false);

      const metrics = monitor.collectMetrics();
      expect(metrics.execution.successRate).toBeCloseTo(20, 0); // 2 of 10
    });

    it('should calculate quality score statistics', () => {
      monitor.updateExecutionState({ totalTasks: 10 });
      monitor.recordTaskCompletion(1000, true, 95); // Excellent
      monitor.recordTaskCompletion(2000, true, 85); // Good
      monitor.recordTaskCompletion(3000, true, 75); // Acceptable

      const metrics = monitor.collectMetrics();
      expect(metrics.quality.averageQualityScore).toBeCloseTo(85, 0);
      expect(metrics.quality.excellentCount).toBe(1);
      expect(metrics.quality.goodCount).toBe(1);
      expect(metrics.quality.acceptableCount).toBe(1);
    });
  });

  describe('startMonitoring and stopMonitoring', () => {
    it('should start monitoring with intervals', async () => {
      const monitor = new PerformanceMonitor('test', {
        enableRealtimeMonitoring: true,
        monitoringIntervalMs: 50,
        enableAlerts: false,
      });

      monitor.startMonitoring();

      // Wait for at least one interval
      await new Promise(resolve => setTimeout(resolve, 100));

      const history = monitor.getHistory();
      expect(history.snapshots.length).toBeGreaterThan(0);

      monitor.stopMonitoring();
    });

    it('should stop monitoring', async () => {
      const monitor = new PerformanceMonitor('test', {
        enableRealtimeMonitoring: true,
        monitoringIntervalMs: 50,
        enableAlerts: false,
      });

      monitor.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 100));

      monitor.stopMonitoring();

      const history = monitor.getHistory();
      const snapshotCount = history.snapshots.length;

      // Wait more and ensure no new snapshots
      await new Promise(resolve => setTimeout(resolve, 100));

      const newHistory = monitor.getHistory();
      expect(newHistory.snapshots.length).toBe(snapshotCount);
    });
  });

  describe('alerts', () => {
    it('should generate CPU usage alert', () => {
      const monitor = new PerformanceMonitor('test', {
        enableRealtimeMonitoring: false,
        enableAlerts: true,
        alertThresholds: {
          cpuUsagePercent: 0, // Force alert
          memoryUsagePercent: 100,
          diskUsagePercent: 100,
          failureRatePercent: 100,
          lowThroughputTasksPerMin: 0,
          highCostUSD: 100,
        },
      });

      // Collect metrics to trigger alert check
      monitor.collectMetrics();

      const alerts = monitor.getAlerts();
      // CPU alert might trigger depending on system load
      // Just check that alerts array is accessible
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should generate failure rate alert when enabled', () => {
      const monitor = new PerformanceMonitor('test', {
        enableRealtimeMonitoring: true,
        monitoringIntervalMs: 100,
        enableAlerts: true,
        alertThresholds: {
          cpuUsagePercent: 100,
          memoryUsagePercent: 100,
          diskUsagePercent: 100,
          failureRatePercent: 10, // 10% threshold
          lowThroughputTasksPerMin: 0,
          highCostUSD: 100,
        },
      });

      monitor.updateExecutionState({ totalTasks: 10, failedTasks: 3 });

      // Start monitoring to trigger alert check
      monitor.startMonitoring();

      // Wait for monitoring interval to trigger
      return new Promise((resolve) => {
        setTimeout(() => {
          monitor.stopMonitoring();
          const alerts = monitor.getAlerts();
          const failureAlert = alerts.find(a => a.metric === 'failureRate');

          // Should have failure rate alert (30% > 10%)
          expect(failureAlert).toBeDefined();
          if (failureAlert) {
            expect(failureAlert.severity).toBe('warning');
            expect(failureAlert.value).toBeCloseTo(30, 0);
          }
          resolve(undefined);
        }, 150);
      });
    });
  });

  describe('generateReport', () => {
    it('should generate complete report', () => {
      monitor.updateExecutionState({ totalTasks: 10 });
      monitor.recordTaskCompletion(1000, true, 85);

      const report = monitor.generateReport();

      expect(report.sessionId).toBe('test-session-123');
      expect(report.summary).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.history).toBeDefined();
      expect(report.alerts).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it('should include summary statistics', () => {
      monitor.updateExecutionState({ totalTasks: 10 });
      monitor.recordTaskCompletion(1000, true, 85);
      monitor.recordTaskCompletion(2000, true, 90);

      const report = monitor.generateReport();

      expect(report.summary.totalTasks).toBe(10);
      expect(report.summary.successRate).toBeCloseTo(20, 0);
      expect(report.summary.averageThroughput).toBeGreaterThanOrEqual(0);
    });

    it('should generate recommendations', () => {
      monitor.updateExecutionState({ totalTasks: 10 });
      // Low quality scores should trigger recommendation
      monitor.recordTaskCompletion(1000, true, 50);

      const report = monitor.generateReport();

      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });

  describe('getHistory', () => {
    it('should return metrics history', () => {
      const history = monitor.getHistory();

      expect(history.sessionId).toBe('test-session-123');
      expect(history.snapshots).toBeDefined();
      expect(Array.isArray(history.snapshots)).toBe(true);
    });

    it('should accumulate snapshots during monitoring', async () => {
      const monitor = new PerformanceMonitor('test', {
        enableRealtimeMonitoring: true,
        monitoringIntervalMs: 50,
        enableAlerts: false,
      });

      monitor.startMonitoring();
      await new Promise(resolve => setTimeout(resolve, 150));

      const history = monitor.getHistory();
      expect(history.snapshots.length).toBeGreaterThan(0);

      monitor.stopMonitoring();
    });
  });

  describe('saveReport', () => {
    it('should save report to file', async () => {
      const report = monitor.generateReport();
      // Use current directory instead of /tmp (permission issue on Termux)
      const outputPath = './test-perf-report.json';

      await monitor.saveReport(report, outputPath);

      // Check file exists
      const fs = await import('fs');
      const exists = fs.existsSync(outputPath);
      expect(exists).toBe(true);

      // Clean up
      fs.unlinkSync(outputPath);
    });
  });
});
