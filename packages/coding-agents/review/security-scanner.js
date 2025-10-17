/**
 * Security Scanner - Strategy Pattern Implementation
 *
 * Provides extensible security scanning framework with:
 * - Interface for security scanners
 * - Multiple scanner implementations
 * - Easy addition of new scanners
 */
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
// ============================================================================
// Scanner Implementations
// ============================================================================
/**
 * Hardcoded Secrets Scanner
 *
 * Detects:
 * - API keys
 * - Passwords
 * - Tokens
 * - GitHub tokens
 * - Anthropic API keys
 */
export class SecretsScanner {
    name = 'SecretsScanner';
    // Note: Patterns are recreated on each line to reset regex state
    getSecretPatterns() {
        return [
            { pattern: /(?:api[_-]?key|apikey)[\s]*[:=][\s]*['"]([^'"]+)['"]/gi, name: 'API Key' },
            { pattern: /(?:password|passwd|pwd)[\s]*[:=][\s]*['"]([^'"]+)['"]/gi, name: 'Password' },
            { pattern: /(?:secret|token)[\s]*[:=][\s]*['"]([^'"]+)['"]/gi, name: 'Secret/Token' },
            { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: 'Anthropic API Key' },
            { pattern: /ghp_[a-zA-Z0-9]{36,}/g, name: 'GitHub Token' },
        ];
    }
    async scan(files) {
        const issues = [];
        for (const file of files) {
            try {
                const content = await fs.promises.readFile(file, 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Get fresh patterns for each line to ensure clean regex state
                    for (const { pattern, name } of this.getSecretPatterns()) {
                        if (pattern.test(line)) {
                            issues.push({
                                type: 'security',
                                severity: 'critical',
                                message: `Possible hardcoded ${name} detected`,
                                file,
                                line: i + 1,
                                scoreImpact: 40,
                            });
                        }
                    }
                }
            }
            catch (error) {
                // Ignore file read errors (file may not exist or be inaccessible)
            }
        }
        return issues;
    }
}
/**
 * Vulnerability Patterns Scanner
 *
 * Detects:
 * - eval() usage
 * - innerHTML XSS risks
 * - document.write XSS risks
 * - Command injection risks
 */
export class VulnerabilityScanner {
    name = 'VulnerabilityScanner';
    // Note: Patterns are recreated on each line to reset regex state
    getVulnPatterns() {
        return [
            { pattern: /eval\s*\(/g, name: 'Use of eval()', severity: 'critical' },
            { pattern: /innerHTML\s*=/g, name: 'XSS risk: innerHTML assignment', severity: 'high' },
            { pattern: /document\.write\s*\(/g, name: 'XSS risk: document.write', severity: 'high' },
            { pattern: /exec\s*\(/g, name: 'Command injection risk', severity: 'high' },
        ];
    }
    async scan(files) {
        const issues = [];
        for (const file of files) {
            try {
                const content = await fs.promises.readFile(file, 'utf-8');
                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Get fresh patterns for each line to ensure clean regex state
                    for (const { pattern, name, severity } of this.getVulnPatterns()) {
                        if (pattern.test(line)) {
                            issues.push({
                                type: 'security',
                                severity,
                                message: name,
                                file,
                                line: i + 1,
                                scoreImpact: severity === 'critical' ? 40 : 20,
                            });
                        }
                    }
                }
            }
            catch (error) {
                // Ignore file read errors
            }
        }
        return issues;
    }
}
/**
 * NPM Audit Scanner
 *
 * Detects:
 * - Dependency vulnerabilities (critical/high)
 */
export class NpmAuditScanner {
    name = 'NpmAuditScanner';
    async scan(_files) {
        const issues = [];
        try {
            const { stdout } = await execAsync('npm audit --json', { timeout: 30000 });
            if (stdout) {
                try {
                    const audit = JSON.parse(stdout);
                    if (audit.vulnerabilities) {
                        for (const [pkgName, vuln] of Object.entries(audit.vulnerabilities)) {
                            const v = vuln;
                            if (v.severity === 'critical' || v.severity === 'high') {
                                issues.push({
                                    type: 'security',
                                    severity: v.severity,
                                    message: `Dependency vulnerability in ${pkgName}: ${v.via[0]?.title || 'Unknown issue'}`,
                                    scoreImpact: v.severity === 'critical' ? 40 : 20,
                                });
                            }
                        }
                    }
                }
                catch (parseError) {
                    // Ignore JSON parse errors
                }
            }
        }
        catch (error) {
            // Ignore npm audit execution errors (may fail in non-npm projects)
        }
        return issues;
    }
}
// ============================================================================
// Security Scanner Registry
// ============================================================================
/**
 * Security Scanner Registry (Factory Pattern)
 *
 * Manages available security scanners and provides easy access
 */
export class SecurityScannerRegistry {
    static scanners = new Map();
    /**
     * Register a security scanner
     */
    static register(scanner) {
        this.scanners.set(scanner.name, scanner);
    }
    /**
     * Get all registered scanners
     */
    static getAll() {
        return Array.from(this.scanners.values());
    }
    /**
     * Get scanner by name
     */
    static get(name) {
        return this.scanners.get(name);
    }
    /**
     * Initialize default scanners
     */
    static initializeDefaults() {
        this.register(new SecretsScanner());
        this.register(new VulnerabilityScanner());
        this.register(new NpmAuditScanner());
    }
}
// Initialize default scanners
SecurityScannerRegistry.initializeDefaults();
//# sourceMappingURL=security-scanner.js.map