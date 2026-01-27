import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Shield, ShieldCheck, ShieldAlert, ChevronDown, Info, Eye, EyeOff, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

export interface POPIAConfig {
  enablePIIDetection: boolean;
  enableAutoRedaction: boolean;
  redactEmails: boolean;
  redactPhones: boolean;
  redactIDNumbers: boolean;
  redactCreditCards: boolean;
  showComplianceIndicators: boolean;
  logAPIRequests: boolean;
}

export const DEFAULT_POPIA_CONFIG: POPIAConfig = {
  enablePIIDetection: true,
  enableAutoRedaction: false,  // Off by default - user must opt-in
  redactEmails: true,
  redactPhones: true,
  redactIDNumbers: true,
  redactCreditCards: true,
  showComplianceIndicators: true,
  logAPIRequests: true,
};

interface POPIACompliancePanelProps {
  config: POPIAConfig;
  onConfigChange: (config: POPIAConfig) => void;
  lastPIIDetection?: {
    hasPII: boolean;
    riskLevel: 'none' | 'low' | 'medium' | 'high';
    detectedTypes: string[];
  } | null;
}

export function POPIACompliancePanel({
  config,
  onConfigChange,
  lastPIIDetection,
}: POPIACompliancePanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = (key: keyof POPIAConfig, value: boolean) => {
    onConfigChange({ ...config, [key]: value });
  };

  const getRiskIcon = () => {
    if (!config.enablePIIDetection) {
      return <Shield className="h-4 w-4 text-muted-foreground" />;
    }
    if (!lastPIIDetection || !lastPIIDetection.hasPII) {
      return <ShieldCheck className="h-4 w-4 text-green-500" />;
    }
    if (lastPIIDetection.riskLevel === 'high') {
      return <ShieldAlert className="h-4 w-4 text-red-500" />;
    }
    if (lastPIIDetection.riskLevel === 'medium') {
      return <ShieldAlert className="h-4 w-4 text-orange-500" />;
    }
    return <Shield className="h-4 w-4 text-yellow-500" />;
  };

  const getRiskBadge = () => {
    if (!config.enablePIIDetection) {
      return <Badge variant="outline">Detection Off</Badge>;
    }
    if (!lastPIIDetection || !lastPIIDetection.hasPII) {
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">No PII Detected</Badge>;
    }
    switch (lastPIIDetection.riskLevel) {
      case 'high':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">High Risk</Badge>;
      case 'medium':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Medium Risk</Badge>;
      case 'low':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Low Risk</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-blue-50/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getRiskIcon()}
                <CardTitle className="text-sm font-medium">POPIA Compliance</CardTitle>
                {getRiskBadge()}
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            <CardDescription className="text-xs">
              Personal Information protection settings
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Warning when PII detected but redaction off */}
            {lastPIIDetection?.hasPII && !config.enableAutoRedaction && (
              <Alert variant="destructive" className="bg-orange-50 border-orange-200">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-orange-800">PII Detected</AlertTitle>
                <AlertDescription className="text-orange-700 text-xs">
                  Personal information was detected: {lastPIIDetection.detectedTypes.join(', ')}.
                  Consider enabling auto-redaction before sending to external APIs.
                </AlertDescription>
              </Alert>
            )}

            {/* Main toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="pii-detection" className="text-sm">PII Detection</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Scan documents for personal information (SA ID numbers, emails, phone numbers) before sending to AI</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  id="pii-detection"
                  checked={config.enablePIIDetection}
                  onCheckedChange={(v) => handleChange('enablePIIDetection', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="auto-redaction" className="text-sm">Auto-Redaction</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Automatically mask detected PII before sending to external AI APIs (e.g., 8001015009*** instead of full ID)</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Switch
                  id="auto-redaction"
                  checked={config.enableAutoRedaction}
                  onCheckedChange={(v) => handleChange('enableAutoRedaction', v)}
                  disabled={!config.enablePIIDetection}
                />
              </div>
            </div>

            {/* Redaction options */}
            {config.enableAutoRedaction && (
              <div className="pl-4 border-l-2 border-blue-200 space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Redact the following:</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={config.redactIDNumbers}
                      onChange={(e) => handleChange('redactIDNumbers', e.target.checked)}
                      className="h-3 w-3"
                    />
                    SA ID Numbers
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={config.redactEmails}
                      onChange={(e) => handleChange('redactEmails', e.target.checked)}
                      className="h-3 w-3"
                    />
                    Email Addresses
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={config.redactPhones}
                      onChange={(e) => handleChange('redactPhones', e.target.checked)}
                      className="h-3 w-3"
                    />
                    Phone Numbers
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={config.redactCreditCards}
                      onChange={(e) => handleChange('redactCreditCards', e.target.checked)}
                      className="h-3 w-3"
                    />
                    Credit Cards
                  </label>
                </div>
              </div>
            )}

            {/* Display options */}
            <div className="pt-2 border-t space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={config.showComplianceIndicators}
                  onChange={(e) => handleChange('showComplianceIndicators', e.target.checked)}
                  className="h-3 w-3"
                />
                Show compliance indicators in chat
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={config.logAPIRequests}
                  onChange={(e) => handleChange('logAPIRequests', e.target.checked)}
                  className="h-3 w-3"
                />
                Log API requests for audit trail
              </label>
            </div>

            {/* Info box */}
            <div className="bg-blue-100/50 rounded-md p-2 text-xs text-blue-800">
              <p className="font-medium">POPIA Compliance Note:</p>
              <p className="mt-1">
                Document content is processed by Google Gemini AI. Enable auto-redaction
                to mask personal information before external API calls.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

/**
 * Compact compliance indicator badge for the chat interface
 */
export function ComplianceIndicator({
  piiDetected,
  redactionEnabled,
  riskLevel,
}: {
  piiDetected: boolean;
  redactionEnabled: boolean;
  riskLevel?: 'none' | 'low' | 'medium' | 'high';
}) {
  if (!piiDetected) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 bg-green-50 border-green-200 text-green-700">
              <ShieldCheck className="h-3 w-3" />
              Compliant
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>No personal information detected in this request</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (redactionEnabled) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 bg-blue-50 border-blue-200 text-blue-700">
              <Shield className="h-3 w-3" />
              Redacted
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Personal information was detected and automatically redacted</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const colorClass = riskLevel === 'high'
    ? 'bg-red-50 border-red-200 text-red-700'
    : riskLevel === 'medium'
    ? 'bg-orange-50 border-orange-200 text-orange-700'
    : 'bg-yellow-50 border-yellow-200 text-yellow-700';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 gap-1 ${colorClass}`}>
            <ShieldAlert className="h-3 w-3" />
            PII Risk
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Personal information detected but not redacted. Consider enabling auto-redaction.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
