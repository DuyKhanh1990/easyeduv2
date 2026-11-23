import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { assignmentMkvDerivatives } from "@shared/schema";
import type { AssignmentMkvDerivative } from "@shared/schema";
import { db, pool } from "../db";
import {
  deletePortalUploadFromUrl,
  downloadPortalUploadToDisk,
  uploadFileToS3FromDisk,
} from "../lib/s3";
import { addS3Bytes, recordFileUpload, subtractFileByUrl } from "../lib/storage-usage";

const execFileAsync = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
const MAX_JOBS_PER_ASSIGNMENT_RESPONSE = 40;
const STALE_JOB_MINUTES = 240;

export type MkvProcessingStatus = "queued" | "processing" | "ready" | "failed";

export type AssignmentMediaAttachment = {
  name: string;
  url: string;
  playbackUrl?: string | null;
  posterUrl?: string | null;
  mediaProcessingStatus?: MkvProcessingStatus;
};

type AssignmentRowWithAttachments = {
  homeworkAttachments?: AssignmentMediaAttachment[];
  submissionAttachments?: AssignmentMediaAttachment[];
};

function getVideoKind(name: string, url: string): "mkv" | "mp4" | null {
  const candidates = [name, url].map((value) => (value || "").split(/[?#]/, 1)[0]);
  if (candidates.some((value) => /\.mkv$/i.test(value))) return "mkv";
  if (candidates.some((value) => /\.mp4$/i.test(value))) return "mp4";
  return null;
}

function isVideoAttachment(attachment: AssignmentMediaAttachment): boolean {
  const name = (attachment.name || "").split(/[?#]/, 1)[0];
  const urlPath = (attachment.url || "").split(/[?#]/, 1)[0];
  return getVideoKind(name, urlPath) !== null;
}

function isMissingDerivativeTable(error: any): boolean {
  return error?.code === "42P01" || /assignment_mkv_derivatives.*does not exist/i.test(error?.message || "");
}

let missingTableWarningLogged = false;

export async function queueAssignmentVideoDerivative(
  sourceUrl: string,
  sourceName: string,
): Promise<void> {
  if (!sourceUrl || !getVideoKind(sourceName, sourceUrl)) return;
  try {
    await db.insert(assignmentMkvDerivatives)
      .values({ sourceUrl, sourceName: sourceName || "video" })
      .onConflictDoNothing({ target: assignmentMkvDerivatives.sourceUrl });
  } catch (error: any) {
    if (isMissingDerivativeTable(error)) {
      if (!missingTableWarningLogged) {
        console.warn("[Assignment MKV] Derivative table is not installed yet; original videos remain available.");
        missingTableWarningLogged = true;
      }
      return;
    }
    console.warn("[Assignment MKV] Could not queue video conversion:", error?.message || error);
  }
}

/**
 * Adds optional preview fields to My Space video attachments.
 * MKV attachments receive an iOS MP4 derivative and poster; existing MP4s
 * receive a poster only. Original URLs and non-video files stay unchanged.
 */
export async function enrichAssignmentRowsWithVideo<T extends AssignmentRowWithAttachments>(
  rows: T[],
): Promise<T[]> {
  const candidates = new Map<string, AssignmentMediaAttachment>();
  for (const row of rows) {
    for (const attachment of [
      ...(row.homeworkAttachments ?? []),
      ...(row.submissionAttachments ?? []),
    ]) {
      if (attachment?.url && isVideoAttachment(attachment)) {
        candidates.set(attachment.url, attachment);
      }
    }
  }
  if (candidates.size === 0) return rows;

  const entries = [...candidates.entries()];
  const toQueue = entries.slice(0, MAX_JOBS_PER_ASSIGNMENT_RESPONSE);
  try {
    for (let offset = 0; offset < toQueue.length; offset += 250) {
      const batch = toQueue.slice(offset, offset + 250);
      await db.insert(assignmentMkvDerivatives)
        .values(batch.map(([sourceUrl, attachment]) => ({
          sourceUrl,
           sourceName: attachment.name || "video",
        })))
        .onConflictDoNothing({ target: assignmentMkvDerivatives.sourceUrl });
    }

    const records = await db.select({
      sourceUrl: assignmentMkvDerivatives.sourceUrl,
      status: assignmentMkvDerivatives.status,
      playbackUrl: assignmentMkvDerivatives.playbackUrl,
      posterUrl: assignmentMkvDerivatives.posterUrl,
    })
      .from(assignmentMkvDerivatives)
      .where(inArray(assignmentMkvDerivatives.sourceUrl, entries.map(([url]) => url)));

    const byUrl = new Map(records.map((record) => [record.sourceUrl, record]));
    const enrich = (attachment: AssignmentMediaAttachment): AssignmentMediaAttachment => {
       if (!attachment?.url || !isVideoAttachment(attachment)) return attachment;
      const record = byUrl.get(attachment.url);
      if (!record) return attachment;
      return {
        ...attachment,
        playbackUrl: record.playbackUrl,
        posterUrl: record.posterUrl,
        mediaProcessingStatus: record.status as MkvProcessingStatus,
      };
    };

    return rows.map((row) => ({
      ...row,
      homeworkAttachments: row.homeworkAttachments?.map(enrich),
      submissionAttachments: row.submissionAttachments?.map(enrich),
    }));
  } catch (error: any) {
    if (isMissingDerivativeTable(error)) {
      if (!missingTableWarningLogged) {
        console.warn("[Assignment MKV] Derivative table is not installed yet; original videos remain available.");
        missingTableWarningLogged = true;
      }
      return rows;
    }
    console.warn("[Assignment MKV] Could not attach conversion status:", error?.message || error);
    return rows;
  }
}

type ClaimedJob = Pick<AssignmentMkvDerivative, "id" | "sourceUrl" | "sourceName">;

async function claimNextJob(): Promise<ClaimedJob | null> {
  const result = await pool.query<ClaimedJob>(
    `WITH next_job AS (
       SELECT id
       FROM assignment_mkv_derivatives
       WHERE status = 'queued'
          OR (status = 'processing' AND updated_at < NOW() - ($1::int * INTERVAL '1 minute'))
       ORDER BY created_at
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE assignment_mkv_derivatives AS job
     SET status = 'processing',
         attempts = job.attempts + 1,
         updated_at = NOW(),
         error = NULL
     FROM next_job
     WHERE job.id = next_job.id
     RETURNING job.id::text AS id, job.source_url AS "sourceUrl", job.source_name AS "sourceName"`,
    [STALE_JOB_MINUTES],
  );
  return result.rows[0] ?? null;
}

async function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  await execFileAsync(FFMPEG, ["-nostdin", "-v", "error", "-y", ...args], {
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function createIosMp4(inputPath: string, outputPath: string): Promise<void> {
  const { stdout } = await execFileAsync(FFPROBE, [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name",
    "-of", "json",
    inputPath,
  ], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });

  const probe = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; codec_name?: string }>;
  };
  const streams = probe.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  if (!video?.codec_name) throw new Error("MKV không có luồng hình ảnh để phát.");

  const canRemuxVideo = video.codec_name === "h264" || video.codec_name === "hevc";
  const canRemuxAudio = !audio || audio.codec_name === "aac";

  if (canRemuxVideo && canRemuxAudio) {
    const args = [
      "-i", inputPath,
      "-map", "0:v:0",
      "-map", "0:a?",
      "-c", "copy",
      ...(video.codec_name === "hevc" ? ["-tag:v", "hvc1"] : []),
      "-movflags", "+faststart",
      outputPath,
    ];
    try {
      await runFfmpeg(args, 30 * 60 * 1000);
      return;
    } catch (error) {
      console.warn("[Assignment MKV] Remux failed; falling back to H.264/AAC encode.");
      // A container-level copy can still fail for damaged or unusual MKV files.
      // Re-encode below, leaving the source object untouched.
      void error;
    }
  }

  await runFfmpeg([
    "-i", inputPath,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    ...(audio ? ["-c:a", "aac", "-b:a", "128k"] : []),
    "-movflags", "+faststart",
    outputPath,
  ], 4 * 60 * 60 * 1000);
}

async function markFailed(jobId: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE assignment_mkv_derivatives
     SET status = 'failed', error = $2, updated_at = NOW()
     WHERE id = $1`,
    [jobId, message.slice(0, 2000)],
  );
}

async function processJob(job: ClaimedJob): Promise<void> {
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "assignment-mkv-"));
  const videoKind = getVideoKind(job.sourceName, job.sourceUrl);
  const inputPath = path.join(workDir, videoKind === "mp4" ? "source.mp4" : "source.mkv");
  const mp4Path = path.join(workDir, "playback.mp4");
  const posterPath = path.join(workDir, "poster.jpg");
  let playbackUrl: string | null = null;
  let posterUrl: string | null = null;

  try {
    if (!videoKind) throw new Error("Chỉ hỗ trợ tạo ảnh xem trước cho file MKV hoặc MP4.");
    await downloadPortalUploadToDisk(job.sourceUrl, inputPath);

    const safeStem = path.basename(job.sourceName, path.extname(job.sourceName))
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 180) || "assignment-video";
    let posterSourcePath = inputPath;
    if (videoKind === "mkv") {
      await createIosMp4(inputPath, mp4Path);
      const mp4Size = (await fs.promises.stat(mp4Path)).size;
      playbackUrl = await uploadFileToS3FromDisk(
        mp4Path,
        mp4Size,
        `${safeStem}.mp4`,
        "video/mp4",
      );
      await addS3Bytes(mp4Size);
      await recordFileUpload(playbackUrl, mp4Size);
      posterSourcePath = mp4Path;
    }

    try {
      await runFfmpeg([
        "-i", posterSourcePath,
        "-frames:v", "1",
        "-vf", "scale='min(640,iw)':-2",
        "-q:v", "5",
        posterPath,
      ], 2 * 60 * 1000);
      const posterSize = (await fs.promises.stat(posterPath)).size;
      posterUrl = await uploadFileToS3FromDisk(
        posterPath,
        posterSize,
        `${safeStem}.jpg`,
        "image/jpeg",
      );
      await addS3Bytes(posterSize);
      await recordFileUpload(posterUrl, posterSize);
    } catch (error: any) {
      // A poster is an optional preview; a playable MP4 is the required result.
      if (videoKind === "mp4") throw error;
      console.warn("[Assignment MKV] Poster generation skipped:", error?.message || error);
    }

    await pool.query(
      `UPDATE assignment_mkv_derivatives
       SET status = 'ready', playback_url = $2, poster_url = $3, error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [job.id, playbackUrl, posterUrl],
    );
    console.log(
      videoKind === "mkv"
        ? "[Assignment MKV] Converted assignment video"
        : "[Assignment MP4] Created video poster",
      { jobId: job.id },
    );
  } catch (error: any) {
    for (const derivativeUrl of [posterUrl, playbackUrl]) {
      if (!derivativeUrl) continue;
      try {
        await deletePortalUploadFromUrl(derivativeUrl);
        await subtractFileByUrl(derivativeUrl);
      } catch (cleanupError: any) {
        console.warn("[Assignment MKV] Could not clean incomplete derivative:", cleanupError?.message || cleanupError);
      }
    }
    const message = error?.message || (videoKind === "mkv"
      ? "Không thể tạo bản MP4 cho video MKV."
      : "Không thể tạo ảnh xem trước cho video MP4.");
    await markFailed(job.id, message);
    console.error("[Assignment MKV] Conversion failed", { jobId: job.id, message });
  } finally {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  }
}

let workerTimer: NodeJS.Timeout | null = null;
let workerBusy = false;
let workerTableWarningLogged = false;

async function processNextJob(): Promise<void> {
  if (workerBusy) return;
  workerBusy = true;
  try {
    const job = await claimNextJob();
    workerTableWarningLogged = false;
    if (job) await processJob(job);
  } catch (error: any) {
    if (isMissingDerivativeTable(error)) {
      if (!workerTableWarningLogged) {
        console.warn("[Assignment MKV] Worker waiting for assignment_mkv_derivatives schema.");
        workerTableWarningLogged = true;
      }
      return;
    }
    console.error("[Assignment MKV] Worker error:", error?.message || error);
  } finally {
    workerBusy = false;
  }
}

export function startAssignmentMkvDerivativeWorker(): void {
  if (workerTimer) return;
  workerTimer = setInterval(() => {
    void processNextJob();
  }, 5_000);
  workerTimer.unref();
  console.log("[Assignment MKV] Background MP4 conversion worker started (one video at a time).");
}
