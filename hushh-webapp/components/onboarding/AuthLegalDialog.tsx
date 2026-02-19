"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  KAI_LEGAL_DOCUMENTS,
  type KaiLegalDocumentType,
} from "@/lib/legal/kai-legal-content";

type AuthLegalDialogProps = {
  docType: KaiLegalDocumentType | null;
  onOpenChange: (open: boolean) => void;
};

export function AuthLegalDialog({ docType, onOpenChange }: AuthLegalDialogProps) {
  const isOpen = docType !== null;
  const content = docType ? KAI_LEGAL_DOCUMENTS[docType] : null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(36rem,calc(100%-1.5rem))] gap-3 p-0">
        {content ? (
          <>
            <DialogHeader className="px-5 pt-5 text-left">
              <div className="flex items-center gap-2">
                <DialogTitle>{content.title}</DialogTitle>
                <Badge variant="secondary" className="text-[10px]">
                  Updated {content.updatedAt}
                </Badge>
              </div>
              <DialogDescription>{content.summary}</DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[min(68dvh,34rem)] px-5 pb-5">
              <div className="space-y-5 pr-3">
                {content.sections.map((section) => (
                  <section key={section.title} className="space-y-2">
                    <h3 className="text-sm font-semibold">{section.title}</h3>
                    <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
                      {section.points.map((point) => (
                        <li key={point} className="leading-relaxed">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </ScrollArea>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
