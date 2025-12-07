/**
 * Report Templates for Audit Review System
 * Generates structured HTML reports for compliance assessments
 */

export interface AuditReviewData {
  clientName?: string;
  reviewDate: string;
  complianceScore: number;
  totalRequirements: number;
  metRequirements: number;
  partialRequirements: number;
  unmetRequirements: number;
  findings: Finding[];
  gaps: Gap[];
  recommendations: Recommendation[];
}

export interface Finding {
  id: string;
  requirement: string;
  status: 'met' | 'partial' | 'unmet';
  evidence: string;
  reference?: string;
}

export interface Gap {
  id: string;
  requirement: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  impact: string;
}

export interface Recommendation {
  id: string;
  gap: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  effort: string;
}

export const generateAuditReportHTML = (data: AuditReviewData): string => {
  const { 
    clientName = 'Client Organization',
    reviewDate,
    complianceScore,
    totalRequirements,
    metRequirements,
    partialRequirements,
    unmetRequirements,
    findings = [],
    gaps = [],
    recommendations = []
  } = data;

  const statusColor = (status: string) => {
    switch (status) {
      case 'met': return '#10b981';
      case 'partial': return '#f59e0b';
      case 'unmet': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Audit Review Report - ${clientName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #f9fafb;
      padding: 40px 20px;
    }
    
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
    }
    
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    
    .header p {
      font-size: 16px;
      opacity: 0.95;
    }
    
    .meta-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      padding: 30px 40px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .meta-item {
      display: flex;
      flex-direction: column;
    }
    
    .meta-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .meta-value {
      font-size: 18px;
      font-weight: 700;
      color: #1f2937;
    }
    
    .content {
      padding: 40px;
    }
    
    .section {
      margin-bottom: 40px;
    }
    
    .section-title {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #667eea;
    }
    
    .score-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      text-align: center;
      margin-bottom: 30px;
    }
    
    .score-value {
      font-size: 72px;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 10px;
    }
    
    .score-label {
      font-size: 18px;
      opacity: 0.95;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-top: 30px;
    }
    
    .stat-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
    }
    
    .stat-value {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 5px;
    }
    
    .stat-label {
      font-size: 14px;
      color: #6b7280;
    }
    
    .finding-item {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-left: 4px solid #667eea;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }
    
    .finding-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 12px;
    }
    
    .finding-requirement {
      font-weight: 600;
      font-size: 16px;
      color: #1f2937;
      flex: 1;
    }
    
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 12px;
    }
    
    .finding-evidence {
      color: #4b5563;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 8px;
    }
    
    .finding-reference {
      color: #667eea;
      font-size: 13px;
      font-style: italic;
    }
    
    .gap-item {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-left: 4px solid #ef4444;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }
    
    .gap-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 12px;
    }
    
    .gap-requirement {
      font-weight: 600;
      font-size: 16px;
      color: #991b1b;
      flex: 1;
    }
    
    .severity-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 12px;
      color: white;
    }
    
    .gap-description {
      color: #7f1d1d;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 8px;
    }
    
    .gap-impact {
      color: #991b1b;
      font-size: 13px;
      font-weight: 500;
    }
    
    .recommendation-item {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-left: 4px solid #0284c7;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }
    
    .recommendation-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      margin-bottom: 12px;
    }
    
    .recommendation-gap {
      font-weight: 600;
      font-size: 16px;
      color: #075985;
      flex: 1;
    }
    
    .priority-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 12px;
      color: white;
    }
    
    .recommendation-text {
      color: #0c4a6e;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 8px;
    }
    
    .recommendation-effort {
      color: #075985;
      font-size: 13px;
      font-weight: 500;
    }
    
    .footer {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 30px 40px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }
    
    @media print {
      body {
        background: white;
        padding: 0;
      }
      
      .container {
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Audit Review Report</h1>
      <p>Comprehensive Compliance Assessment & Gap Analysis</p>
    </div>
    
    <div class="meta-info">
      <div class="meta-item">
        <span class="meta-label">Client</span>
        <span class="meta-value">${clientName}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Review Date</span>
        <span class="meta-value">${reviewDate}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Total Requirements</span>
        <span class="meta-value">${totalRequirements}</span>
      </div>
    </div>
    
    <div class="content">
      <!-- Executive Summary -->
      <section class="section">
        <h2 class="section-title">Executive Summary</h2>
        <div class="score-card">
          <div class="score-value">${complianceScore}%</div>
          <div class="score-label">Overall Compliance Score</div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value" style="color: #10b981;">${metRequirements}</div>
            <div class="stat-label">Requirements Met</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #f59e0b;">${partialRequirements}</div>
            <div class="stat-label">Partially Met</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color: #ef4444;">${unmetRequirements}</div>
            <div class="stat-label">Not Met</div>
          </div>
        </div>
      </section>
      
      <!-- Detailed Findings -->
      ${findings.length > 0 ? `
      <section class="section">
        <h2 class="section-title">Detailed Findings</h2>
        ${findings.map(finding => `
          <div class="finding-item">
            <div class="finding-header">
              <div class="finding-requirement">${finding.requirement}</div>
              <span class="status-badge" style="background-color: ${statusColor(finding.status)}; color: white;">
                ${finding.status.toUpperCase()}
              </span>
            </div>
            <div class="finding-evidence">${finding.evidence}</div>
            ${finding.reference ? `<div class="finding-reference">Reference: ${finding.reference}</div>` : ''}
          </div>
        `).join('')}
      </section>
      ` : ''}
      
      <!-- Gap Analysis -->
      ${gaps.length > 0 ? `
      <section class="section">
        <h2 class="section-title">Gap Analysis</h2>
        ${gaps.map(gap => `
          <div class="gap-item">
            <div class="gap-header">
              <div class="gap-requirement">${gap.requirement}</div>
              <span class="severity-badge" style="background-color: ${severityColor(gap.severity)};">
                ${gap.severity.toUpperCase()}
              </span>
            </div>
            <div class="gap-description">${gap.description}</div>
            <div class="gap-impact"><strong>Impact:</strong> ${gap.impact}</div>
          </div>
        `).join('')}
      </section>
      ` : ''}
      
      <!-- Recommendations -->
      ${recommendations.length > 0 ? `
      <section class="section">
        <h2 class="section-title">Recommendations</h2>
        ${recommendations.map(rec => `
          <div class="recommendation-item">
            <div class="recommendation-header">
              <div class="recommendation-gap">${rec.gap}</div>
              <span class="priority-badge" style="background-color: ${severityColor(rec.priority)};">
                ${rec.priority.toUpperCase()} PRIORITY
              </span>
            </div>
            <div class="recommendation-text">${rec.recommendation}</div>
            <div class="recommendation-effort"><strong>Estimated Effort:</strong> ${rec.effort}</div>
          </div>
        `).join('')}
      </section>
      ` : ''}
    </div>
    
    <div class="footer">
      <p>This report was generated by the Audit Review System on ${new Date().toLocaleString()}</p>
      <p style="margin-top: 10px;">© ${new Date().getFullYear()} All rights reserved. Confidential and proprietary.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};

// Mock function to simulate audit review generation
export const generateMockAuditReview = (
  clientDocs: { name: string }[],
  toolkitDocs: { name: string }[]
): AuditReviewData => {
  // This is a mock implementation
  // In production, this would be replaced by actual AI-powered analysis
  
  const totalRequirements = 15;
  const metRequirements = 8;
  const partialRequirements = 4;
  const unmetRequirements = 3;
  const complianceScore = Math.round((metRequirements + partialRequirements * 0.5) / totalRequirements * 100);

  return {
    clientName: 'Sample Client Organization',
    reviewDate: new Date().toLocaleDateString(),
    complianceScore,
    totalRequirements,
    metRequirements,
    partialRequirements,
    unmetRequirements,
    findings: [
      {
        id: '1',
        requirement: 'Data Privacy Policy Documentation',
        status: 'met',
        evidence: 'Client has comprehensive data privacy policy documented in "Privacy_Framework_v2.pdf" covering all required aspects including data collection, storage, and user rights.',
        reference: 'Privacy_Framework_v2.pdf, Section 3.2'
      },
      {
        id: '2',
        requirement: 'Security Incident Response Plan',
        status: 'partial',
        evidence: 'Incident response procedures are outlined, but missing specific escalation timelines and external communication protocols required by the assessment toolkit.',
        reference: 'Security_Policy.pdf, Section 7'
      },
      {
        id: '3',
        requirement: 'Access Control Matrix',
        status: 'unmet',
        evidence: 'No documented access control matrix found in client materials. The toolkit requires a comprehensive role-based access control (RBAC) documentation.',
      }
    ],
    gaps: [
      {
        id: '1',
        requirement: 'Access Control Matrix',
        description: 'Client documentation does not include a formal access control matrix defining role-based permissions across systems and data assets.',
        severity: 'high',
        impact: 'Without proper access control documentation, there is increased risk of unauthorized data access and difficulty in maintaining compliance with data protection regulations.'
      },
      {
        id: '2',
        requirement: 'Incident Response Communication Protocols',
        description: 'Current incident response plan lacks specific protocols for external stakeholder communication during security incidents.',
        severity: 'medium',
        impact: 'May result in delayed or inconsistent communication during incidents, potentially affecting regulatory compliance and stakeholder trust.'
      }
    ],
    recommendations: [
      {
        id: '1',
        gap: 'Access Control Matrix',
        recommendation: 'Develop and document a comprehensive Role-Based Access Control (RBAC) matrix that defines permissions for each role across all systems. Include regular review procedures and approval workflows.',
        priority: 'high',
        effort: '2-3 weeks with involvement from IT Security and Department Heads'
      },
      {
        id: '2',
        gap: 'Incident Response Communication',
        recommendation: 'Enhance the incident response plan by adding specific communication protocols including: notification timelines, escalation procedures, templates for external communications, and designated spokespersons.',
        priority: 'medium',
        effort: '1 week with Security Team and Communications Department'
      }
    ]
  };
};
