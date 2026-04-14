"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DollarSign, Image, FileText, Cpu } from "lucide-react";

interface CostDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  frameCount: number;
  estimatedTokens: number;
  estimatedCost: number;
  videoDuration: number;
}

export function CostDialog({
  open,
  onConfirm,
  onCancel,
  frameCount,
  estimatedTokens,
  estimatedCost,
  videoDuration,
}: CostDialogProps) {
  const transcriptionCost = (videoDuration / 60) * 0.006;
  const totalCost = estimatedCost + transcriptionCost;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm AI Analysis</DialogTitle>
          <DialogDescription>
            This will use your OpenAI API key to analyze the video. Here is the
            estimated cost breakdown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center gap-3 text-sm">
            <Image className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Frames to analyze</span>
            <span className="ml-auto font-mono">{frameCount}</span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Estimated tokens</span>
            <span className="ml-auto font-mono">
              ~{estimatedTokens.toLocaleString()}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              Transcription ({(videoDuration / 60).toFixed(1)} min)
            </span>
            <span className="ml-auto font-mono">
              ~${transcriptionCost.toFixed(4)}
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              GPT-5.4 analysis
            </span>
            <span className="ml-auto font-mono">
              ~${estimatedCost.toFixed(4)}
            </span>
          </div>

          <div className="border-t pt-3 flex items-center gap-3 text-sm font-medium">
            <DollarSign className="h-4 w-4 text-primary shrink-0" />
            <span>Total estimated cost</span>
            <span className="ml-auto font-mono text-primary">
              ~${totalCost.toFixed(4)}
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Actual cost may vary. Charged to your OpenAI account.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Confirm and analyze</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
