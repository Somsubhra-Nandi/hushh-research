// components/kai/views/portfolio-import-view.tsx

/**
 * Portfolio Import View - Full-screen UI for uploading brokerage statements
 *
 * Features:
 * - Drag-and-drop zone for PDF/CSV files
 * - Supported brokerages list
 * - Skip option (minimal)
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/lib/morphy-ux/card";
import { Button as MorphyButton } from "@/lib/morphy-ux/button";

import { Upload, FileText, CheckCircle, AlertCircle, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/lib/morphy-ux/ui";

// =============================================================================
// TYPES
// =============================================================================

interface PortfolioImportViewProps {
  onFileSelect: (file: File) => void;
  onSkip: () => void;
  isUploading?: boolean;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PortfolioImportView({
  onFileSelect,
  onSkip,
  isUploading = false,
}: PortfolioImportViewProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Handle file drop
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const file = files[0];

      if (file && (file.type === "application/pdf" || file.name.endsWith(".csv"))) {
        setSelectedFile(file);
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  // Handle file input change
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files[0]) {
        setSelectedFile(files[0]);
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  // Handle drag over
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  // Handle drag leave
  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Trigger file input click
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4 px-4 pt-4 pb-[calc(var(--app-bottom-inset)+1rem)]">
      {/* Header */}
      <div className="text-center space-y-2 px-2">
        <h1 className="text-[34px] font-bold tracking-tight leading-[1.08]">
          Your data
          <br />
          <span className="hushh-gradient-text">Your decisions</span>
        </h1>
        <p className="text-[17px] font-medium text-muted-foreground leading-snug">
          Let Kai analyze your holdings for precise advice
        </p>
      </div>

      <div className="px-2 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Choose import method
        </p>
      </div>

      {/* Plaid integration */}
      <Card variant="none" effect="glass" showRipple={false}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
                <Icon icon={Link2} size="md" className="text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[17px] font-semibold leading-tight">Connect with Plaid</h3>
                <p className="text-[13px] font-medium text-muted-foreground leading-snug">
                  Automatically sync your brokerage accounts
                </p>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-2">
              <Badge className="border border-[var(--brand-200)] bg-[var(--brand-50)] text-[var(--brand-700)]">
                Best results
              </Badge>
              <Badge variant="outline">Coming soon</Badge>
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Best for richer context and cleaner portfolio normalization.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 px-2">
        <div className="h-px flex-1 bg-border/60" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          or
        </span>
        <div className="h-px flex-1 bg-border/60" />
      </div>

      {/* Statement upload */}
      <Card variant="none" effect="glass" showRipple={false}>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
              <Icon icon={Upload} size="md" className="text-primary" />
            </div>
            <div>
              <h3 className="text-[17px] font-semibold text-foreground">Upload statement</h3>
              <p className="text-[13px] font-medium text-muted-foreground">
                Import official brokerage PDF or CSV manually
              </p>
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "relative border border-dashed rounded-3xl p-7 transition-all duration-200 text-center cursor-pointer min-h-44 flex flex-col items-center justify-center",
              isDragging
                ? "border-primary bg-primary/8 scale-[1.01]"
                : "border-border/70 hover:border-primary/50 hover:bg-muted/25",
              isUploading && "pointer-events-none opacity-50"
            )}
            onClick={triggerFileInput}
          >
            {/* Upload Icon */}
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 border border-primary/15 flex items-center justify-center mb-3">
              <Icon icon={Upload} size={30} className="text-primary" />
            </div>

            {/* Text */}
            <div className="space-y-1">
              <h3 className="text-[17px] font-semibold text-primary">
                {isDragging
                  ? "Drop your file here"
                  : "Tap to upload official statement"}
              </h3>
              <p className="text-[14px] font-medium text-muted-foreground">
                PDF or CSV
              </p>
            </div>

            {/* Selected File Display */}
            {selectedFile && !isUploading && (
              <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-sm">
                <Icon icon={FileText} size="sm" />
                <span>{selectedFile.name}</span>
                <Icon icon={CheckCircle} size="sm" className="text-green-500" />
              </div>
            )}

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf"
              onChange={handleFileChange}
              className="hidden"
              disabled={isUploading}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
        <Icon icon={AlertCircle} size="sm" className="mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          We support official brokerage statements from all major systems.
        </p>
      </div>

      {/* Skip Option */}
      <div className="text-center pt-1">
        <MorphyButton
          variant="none"
          effect="fade"
          onClick={onSkip}
          disabled={isUploading}
          className="text-muted-foreground hover:text-foreground text-base"
        >
          Skip for now
        </MorphyButton>
      </div>
    </div>
  );
}
