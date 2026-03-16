"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload, Waves } from "lucide-react";
import { toast } from "sonner";

import {
  RiaCompatibilityState,
  RiaPageShell,
  RiaStatusPanel,
  RiaSurface,
} from "@/components/ria/ria-page-shell";
import { SectionHeader } from "@/components/app-ui/page-sections";
import { SettingsGroup, SettingsRow } from "@/components/profile/settings-ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/lib/morphy-ux/button";
import { usePersonaState } from "@/lib/persona/persona-context";
import { ROUTES } from "@/lib/navigation/routes";
import {
  isIAMSchemaNotReadyError,
  RiaService,
  type RiaPickRow,
  type RiaPickUploadRecord,
} from "@/lib/services/ria-service";

function statusTone(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300";
    case "superseded":
      return "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300";
    case "failed":
      return "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function formatDate(value?: string | null) {
  if (!value) return "Pending";
  return new Date(value).toLocaleString();
}

export default function RiaPicksPage() {
  const { user } = useAuth();
  const { riaCapability } = usePersonaState();
  const [uploads, setUploads] = useState<RiaPickUploadRecord[]>([]);
  const [activeRows, setActiveRows] = useState<RiaPickRow[]>([]);
  const [label, setLabel] = useState("");
  const [fileName, setFileName] = useState<string>("");
  const [fileContent, setFileContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [iamUnavailable, setIamUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeUpload = useMemo(
    () => uploads.find((item) => item.status === "active") || uploads[0] || null,
    [uploads]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user || riaCapability === "setup") {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setIamUnavailable(false);
        setError(null);
        const idToken = await user.getIdToken();
        const payload = await RiaService.listPicks(idToken);
        if (cancelled) return;
        setUploads(payload.items);
        setActiveRows(payload.active_rows);
      } catch (loadError) {
        if (cancelled) return;
        setUploads([]);
        setActiveRows([]);
        setIamUnavailable(isIAMSchemaNotReadyError(loadError));
        setError(loadError instanceof Error ? loadError.message : "Failed to load picks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [riaCapability, user]);

  async function onFileSelected(file: File | null) {
    if (!file) {
      setFileName("");
      setFileContent("");
      return;
    }
    setFileName(file.name);
    setFileContent(await file.text());
  }

  async function onUpload() {
    if (!user || !fileContent.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      const idToken = await user.getIdToken();
      await RiaService.uploadPicks(idToken, {
        csv_content: fileContent,
        source_filename: fileName || undefined,
        label: label.trim() || undefined,
      });
      toast.success("RIA picks uploaded", {
        description: "The new upload is now the active picks list for this advisor.",
      });
      setLabel("");
      setFileName("");
      setFileContent("");
      const payload = await RiaService.listPicks(idToken);
      setUploads(payload.items);
      setActiveRows(payload.active_rows);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Failed to upload picks");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RiaPageShell
      eyebrow="RIA Picks"
      title="Manage the active advisor list that investors will compare against"
      description="Upload one active CSV-backed picks list at a time. Each new upload becomes the active list while older uploads remain in history."
      icon={FileSpreadsheet}
      statusPanel={
        iamUnavailable ? null : (
          <RiaStatusPanel
            title="List state before row detail"
            description="Keep the active upload, history depth, and current row count visible before the advisor starts editing files or reviewing rows."
            items={[
              {
                label: "Active upload",
                value: activeUpload?.label || "None yet",
                helper: activeUpload ? "Current investor-facing list" : "Upload a CSV to activate your first list",
                tone: activeUpload ? "success" : "neutral",
              },
              {
                label: "History",
                value: loading ? "..." : String(uploads.length),
                helper: "Uploads retained for traceability",
                tone: uploads.length > 1 ? "neutral" : "warning",
              },
              {
                label: "Active rows",
                value: loading ? "..." : String(activeRows.length),
                helper: "Rows exposed in the active advisor list",
                tone: activeRows.length > 0 ? "success" : "warning",
              },
              {
                label: "Template",
                value: "Renaissance CSV",
                helper: "Same schema as the default investor list",
                tone: "neutral",
              },
            ]}
          />
        )
      }
      actions={
        <>
          <Button asChild variant="none" effect="fade">
            <a href="/templates/ria-picks-template.csv" download>
              <Download className="mr-2 h-4 w-4" />
              Download template
            </a>
          </Button>
          <Button asChild variant="none" effect="fade">
            <Link href={ROUTES.CONSENTS}>Open consent center</Link>
          </Button>
        </>
      }
    >
      {iamUnavailable ? (
        <RiaCompatibilityState
          title="RIA picks are waiting on the IAM rollout"
          description="The page is ready, but this environment still needs the IAM schema and pick-list tables before uploads can be activated."
        />
      ) : null}

      {!iamUnavailable ? (
        <div className="grid gap-5 lg:grid-cols-[1.05fr_1.45fr]">
          <section className="space-y-3">
            <SectionHeader
              eyebrow="Upload"
              title="Drop in the next active picks list"
              description="Use the provided template so the parser can activate the upload atomically and preserve previous versions as history."
              icon={Upload}
            />
            <RiaSurface className="space-y-4 p-4">
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Upload label, for example Q2 growth rotation"
              />
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void onFileSelected(event.target.files?.[0] || null)}
              />
              {fileName ? (
                <p className="text-sm text-muted-foreground">
                  Ready to upload: <span className="font-medium text-foreground">{fileName}</span>
                </p>
              ) : null}
              {error ? <p className="text-sm text-red-500">{error}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="blue-gradient"
                  effect="fill"
                  onClick={() => void onUpload()}
                  disabled={submitting || !fileContent.trim()}
                >
                  {submitting ? "Uploading..." : "Upload and activate"}
                </Button>
                <Button asChild variant="none" effect="fade">
                  <a href="/templates/ria-picks-template.csv" download>
                    Download sample CSV
                  </a>
                </Button>
              </div>
            </RiaSurface>
          </section>

          <section className="space-y-3">
            <SectionHeader
              eyebrow="Active list"
              title="What investors will compare against today"
              description="The active upload is the advisor list that later search and market comparisons can resolve for linked investors."
              icon={Waves}
            />
            <RiaSurface className="space-y-4 p-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading picks...
                </div>
              ) : null}
              {!loading && activeRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active rows yet. Upload a CSV using the template to populate the list.
                </p>
              ) : null}
              {!loading && activeRows.length > 0 ? (
                <SettingsGroup>
                  {activeRows.slice(0, 20).map((row) => (
                    <SettingsRow
                      key={`${row.ticker}-${row.company_name || "company"}`}
                      icon={FileSpreadsheet}
                      title={
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{row.ticker}</span>
                          {row.tier ? <Badge variant="outline">Tier {row.tier}</Badge> : null}
                          {row.recommendation_bias ? (
                            <Badge variant="secondary">{row.recommendation_bias}</Badge>
                          ) : null}
                        </div>
                      }
                      description={
                        row.investment_thesis ||
                        row.company_name ||
                        row.sector ||
                        "RIA active-list row"
                      }
                      trailing={
                        row.fcf_billions != null ? (
                          <Badge variant="outline">${row.fcf_billions}B FCF</Badge>
                        ) : undefined
                      }
                    />
                  ))}
                </SettingsGroup>
              ) : null}
            </RiaSurface>

            <SectionHeader
              eyebrow="Upload history"
              title="Previous list versions stay traceable"
              description="New uploads replace the active list, but older uploads remain in history so the advisor can audit what changed."
              icon={FileSpreadsheet}
            />
            <RiaSurface className="p-4">
              <SettingsGroup>
                {uploads.map((upload) => (
                  <SettingsRow
                    key={upload.upload_id}
                    icon={upload.status === "active" ? Waves : FileSpreadsheet}
                    title={
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{upload.label}</span>
                        <Badge className={statusTone(upload.status)}>{upload.status}</Badge>
                      </div>
                    }
                    description={
                      upload.source_filename
                        ? `${upload.source_filename} · ${upload.row_count} rows`
                        : `${upload.row_count} rows`
                    }
                    trailing={
                      <span className="text-xs text-muted-foreground">
                        {formatDate(upload.created_at)}
                      </span>
                    }
                  />
                ))}
                {!loading && uploads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No upload history yet.
                  </p>
                ) : null}
              </SettingsGroup>
            </RiaSurface>
          </section>
        </div>
      ) : null}
    </RiaPageShell>
  );
}
