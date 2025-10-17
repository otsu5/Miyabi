/**
 * GitHub Projects V2 Integration
 *
 * Maps to OS concept: Data Persistence Layer (Database)
 *
 * Features:
 * - Task board automation
 * - Custom fields (Agent, Duration, Cost, Quality Score)
 * - Automatic status updates
 * - KPI data collection
 */
import { graphql } from '@octokit/graphql';
export class ProjectsV2Client {
    graphqlClient;
    config;
    projectId;
    constructor(token, config) {
        this.graphqlClient = graphql.defaults({
            headers: {
                authorization: `token ${token}`,
            },
        });
        this.config = config;
    }
    /**
     * Initialize: Get project ID
     */
    async initialize() {
        const query = `
      query($owner: String!, $repo: String!, $projectNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          projectV2(number: $projectNumber) {
            id
            title
            shortDescription
          }
        }
      }
    `;
        try {
            const result = await this.graphqlClient(query, {
                owner: this.config.owner,
                repo: this.config.repo,
                projectNumber: this.config.projectNumber,
            });
            this.projectId = result.repository.projectV2.id;
            console.log(`✓ Connected to project: ${result.repository.projectV2.title}`);
        }
        catch (error) {
            if (error.message?.includes('not been granted the required scopes')) {
                throw new Error('GitHub Token missing required scopes. Please add: read:project, write:project\n' +
                    'See docs/GITHUB_TOKEN_SETUP.md for setup instructions.');
            }
            throw error;
        }
    }
    /**
     * Add Issue to Project
     */
    async addIssueToProject(issueNodeId) {
        if (!this.projectId) {
            await this.initialize();
        }
        const mutation = `
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {
          projectId: $projectId
          contentId: $contentId
        }) {
          item {
            id
          }
        }
      }
    `;
        const result = await this.graphqlClient(mutation, {
            projectId: this.projectId,
            contentId: issueNodeId,
        });
        return result.addProjectV2ItemById.item.id;
    }
    /**
     * Get Issue node ID from issue number
     */
    async getIssueNodeId(issueNumber) {
        const query = `
      query($owner: String!, $repo: String!, $issueNumber: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $issueNumber) {
            id
          }
        }
      }
    `;
        const result = await this.graphqlClient(query, {
            owner: this.config.owner,
            repo: this.config.repo,
            issueNumber,
        });
        return result.repository.issue.id;
    }
    /**
     * Get custom fields from project
     */
    async getCustomFields() {
        if (!this.projectId) {
            await this.initialize();
        }
        const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 20) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;
        const result = await this.graphqlClient(query, {
            projectId: this.projectId,
        });
        return result.node.fields.nodes;
    }
    /**
     * Update custom field value
     */
    async updateFieldValue(itemId, fieldId, value) {
        if (!this.projectId) {
            await this.initialize();
        }
        const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: $value
        }) {
          projectV2Item {
            id
          }
        }
      }
    `;
        await this.graphqlClient(mutation, {
            projectId: this.projectId,
            itemId,
            fieldId,
            value: { text: String(value) },
        });
    }
    /**
     * Update status field (special handling for single select)
     */
    async updateStatus(itemId, status) {
        if (!this.projectId) {
            await this.initialize();
        }
        const fields = await this.getCustomFields();
        const statusField = fields.find(f => f.name === 'Status');
        if (!statusField) {
            throw new Error('Status field not found in project');
        }
        const statusOption = statusField.options?.find(opt => opt.name === status);
        if (!statusOption) {
            throw new Error(`Status option '${status}' not found. Available: ${statusField.options?.map(o => o.name).join(', ')}`);
        }
        const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }) {
          projectV2Item {
            id
          }
        }
      }
    `;
        await this.graphqlClient(mutation, {
            projectId: this.projectId,
            itemId,
            fieldId: statusField.id,
            optionId: statusOption.id,
        });
    }
    /**
     * Get all project items with their field values
     */
    async getProjectItems() {
        if (!this.projectId) {
            await this.initialize();
        }
        const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100) {
              nodes {
                id
                content {
                  ... on Issue {
                    number
                    title
                    state
                  }
                }
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      field {
                        ... on ProjectV2Field {
                          name
                        }
                      }
                      text
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      field {
                        ... on ProjectV2Field {
                          name
                        }
                      }
                      number
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      field {
                        ... on ProjectV2SingleSelectField {
                          name
                        }
                      }
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
        const result = await this.graphqlClient(query, {
            projectId: this.projectId,
        });
        return result.node.items.nodes;
    }
    /**
     * Generate KPI report from project data
     */
    async generateKPIReport() {
        const items = await this.getProjectItems();
        let totalIssues = 0;
        let completedIssues = 0;
        let totalDuration = 0;
        let totalCost = 0;
        let totalQualityScore = 0;
        let qualityScoreCount = 0;
        for (const item of items) {
            if (item.content) {
                totalIssues++;
                if (item.content.state === 'CLOSED') {
                    completedIssues++;
                }
                // Extract custom field values
                if (item.fieldValues?.nodes) {
                    for (const fieldValue of item.fieldValues.nodes) {
                        const fieldName = fieldValue.field.name;
                        const value = fieldValue.text || fieldValue.number || fieldValue.name;
                        if (fieldName === 'Duration' && typeof value === 'number') {
                            totalDuration += value;
                        }
                        else if (fieldName === 'Cost' && typeof value === 'number') {
                            totalCost += value;
                        }
                        else if (fieldName === 'Quality Score' && typeof value === 'number') {
                            totalQualityScore += value;
                            qualityScoreCount++;
                        }
                    }
                }
            }
        }
        return {
            totalIssues,
            completedIssues,
            avgDuration: totalIssues > 0 ? totalDuration / totalIssues : 0,
            totalCost,
            avgQualityScore: qualityScoreCount > 0 ? totalQualityScore / qualityScoreCount : 0,
        };
    }
}
//# sourceMappingURL=projects-v2.js.map