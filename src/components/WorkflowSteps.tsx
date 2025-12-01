import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface WorkflowStep {
  id: number;
  title: string;
  description: string;
  completed: boolean;
}

interface WorkflowStepsProps {
  steps: WorkflowStep[];
}

export const WorkflowSteps = ({ steps }: WorkflowStepsProps) => {
  return (
    <Card className="shadow-soft mb-6">
      <CardContent className="p-6">
        <h2 className="text-lg font-semibold mb-4">Workflow Guide</h2>
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                {step.completed ? (
                  <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0" />
                ) : (
                  <Circle className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                )}
                {index < steps.length - 1 && (
                  <div className={`w-0.5 flex-1 min-h-[20px] mt-2 ${step.completed ? 'bg-primary' : 'bg-border'}`} />
                )}
              </div>
              <div className="flex-1 pb-6">
                <h3 className={`font-medium ${step.completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                  Step {step.id}: {step.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};