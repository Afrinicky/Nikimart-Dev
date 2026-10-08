import "server-only";
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Where Data Bundles backups are kept.
 *
 * The one rule that matters: a backup must not live only inside the thing it
 * is protecting. So nothing here writes to the database — a snapshot goes to a
 * directory on disk, to an S3-compatible bucket, or to both at once, and the
 * history row only records where it went.
 *
 * Two drivers cover everything we need:
 *
 *   local — a directory. Right for a server with a real disk or a mounted
 *           volume. On a serverless host the filesystem is wiped between
 *           invocations, so when nothing is configured at all we fall back to
 *           the system temp directory and mark it `ephemeral`; the console then
 *           says, loudly, to download the file now and set up a bucket.
 *
 *   s3    — any S3-compatible object store: Cloudflare R2, AWS S3, Backblaze
 *           B2, MinIO, or Google Cloud Storage through its XML API. Signed
 *           here with SigV4 over `fetch` rather than through an SDK, because
 *           the three requests we make (PUT, GET, DELETE) are not worth a
 *           dependency tree in the bundle.
 *
 * Credentials are read from the environment and never leave this module. No
 * key, secret, endpoint or connection string is returned to a caller, written
 * into a backup file, stored in the history row, or rendered in the console —
 * what the UI gets is a label and a bucket name.
 */

export type BackupDriver = "local" | "s3";

export interface BackupTarget {
  driver: BackupDriver;
  /** What the console calls this destination, e.g. "Cloudflare R2". */
  label: string;
  /** Safe to show: a directory path or `bucket/prefix`. Never a credential. */
  location: string;
  /**
   * True when the storage does not survive the process — the temp-directory
   * fallback. A backup there is better than nothing for one download and
   * worthless as disaster recovery, and the UI has to say so.
   */
  ephemeral: boolean;
  /** True when this is off-host storage, i.e. a real second copy. */
  offsite: boolean;
}

/** One target a particular backup was written to, as recorded in history. */
export interface BackupLocation {
  driver: BackupDriver;
  label: string;
  key: string;
  ok: boolean;
  error?: string;
}

const S3_DEFAULT_PREFIX = "nickimart/data-bundles/";

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

interface S3Config {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
  label: string;
  /** Path-style (`endpoint/bucket/key`) when an endpoint is given. */
  pathStyle: boolean;
}

function s3Config(): S3Config | null {
  const bucket = env("DATA_BACKUP_S3_BUCKET");
  const accessKeyId = env("DATA_BACKUP_S3_ACCESS_KEY_ID");
  const secretAccessKey = env("DATA_BACKUP_S3_SECRET_ACCESS_KEY");
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  const endpoint = env("DATA_BACKUP_S3_ENDPOINT").replace(/\/+$/, "");
  const prefixRaw = env("DATA_BACKUP_S3_PREFIX") || S3_DEFAULT_PREFIX;
  return {
    bucket,
    // R2 is always "auto"; AWS needs the bucket's real region.
    region: env("DATA_BACKUP_S3_REGION") || "auto",
    endpoint,
    accessKeyId,
    secretAccessKey,
    prefix: prefixRaw.replace(/^\/+/, "").replace(/\/*$/, "/"),
    label: env("DATA_BACKUP_S3_LABEL") || "Cloud storage",
    pathStyle: Boolean(endpoint),
  };
}

function localDir(): { dir: string; ephemeral: boolean } | null {
  const configured = env("DATA_BACKUP_LOCAL_DIR");
  if (configured) return { dir: path.resolve(/* turbopackIgnore: true */ configured), ephemeral: false };
  // Nothing configured anywhere: keep the feature working rather than
  // presenting a dead button, but be honest about what the storage is.
  if (s3Config()) return null;
  return {
    dir: path.join(/* turbopackIgnore: true */ os.tmpdir(), "nickimart-data-backups"),
    ephemeral: true,
  };
}

/**
 * The destinations a new backup will be written to, in the order a download
 * should try them: off-host storage first, because that is the copy that
 * survives the server.
 */
export function backupTargets(): BackupTarget[] {
  const targets: BackupTarget[] = [];

  const s3 = s3Config();
  if (s3) {
    targets.push({
      driver: "s3",
      label: s3.label,
      location: `${s3.bucket}/${s3.prefix}`,
      ephemeral: false,
      offsite: true,
    });
  }

  const local = localDir();
  if (local) {
    targets.push({
      driver: "local",
      label: local.ephemeral ? "Temporary server storage" : "Server disk",
      location: local.dir,
      ephemeral: local.ephemeral,
      offsite: false,
    });
  }

  return targets;
}

/** True once at least one copy lands somewhere that outlives this server. */
export function hasOffsiteBackupStorage(): boolean {
  return backupTargets().some((t) => t.offsite);
}

// ---------------------------------------------------------------------------
// Writing and reading
// ---------------------------------------------------------------------------

/**
 * Write one file to every configured target.
 *
 * Every target is attempted even if an earlier one fails: the point of two
 * copies is that one of them can be broken. The caller decides what to do with
 * a result where nothing succeeded (we fail the backup) versus one where the
 * cloud worked and the disk was full (we keep it, and the history row shows
 * which copy exists).
 */
export async function putBackupFile(
  fileName: string,
  body: Buffer,
  contentType: string,
): Promise<BackupLocation[]> {
  const results: BackupLocation[] = [];

  for (const target of backupTargets()) {
    try {
      const key = await writeTo(target, fileName, body, contentType);
      results.push({ driver: target.driver, label: target.label, key, ok: true });
    } catch (error) {
      // The message is logged and shown to an admin; it comes from our own
      // code or from the store's HTTP status, never from a credential.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[data-backup] ${target.driver} write failed`, message);
      results.push({
        driver: target.driver,
        label: target.label,
        key: "",
        ok: false,
        error: message,
      });
    }
  }

  return results;
}

async function writeTo(
  target: BackupTarget,
  fileName: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  if (target.driver === "local") {
    await mkdir(target.location, { recursive: true });
    const file = path.join(/* turbopackIgnore: true */ target.location, fileName);
    await writeFile(file, body, { mode: 0o600 });
    return file;
  }

  const s3 = s3Config();
  if (!s3) throw new Error("Cloud storage is no longer configured.");
  const key = `${s3.prefix}${fileName}`;
  await s3Request(s3, "PUT", key, body, contentType);
  return key;
}

/**
 * Fetch a stored backup back, trying each recorded copy in turn.
 *
 * Returns the bytes rather than a stream on purpose: the download route
 * verifies the checksum before it sends anything, and you cannot verify a
 * stream you have already handed to the browser.
 */
export async function getBackupFile(locations: BackupLocation[]): Promise<Buffer> {
  const usable = locations.filter((l) => l.ok && l.key);
  if (usable.length === 0) throw new Error("This backup has no stored copy to download.");

  const problems: string[] = [];
  // Off-host first: it is the copy that is still there after the server isn't.
  const ordered = [...usable].sort((a, b) => Number(b.driver === "s3") - Number(a.driver === "s3"));

  for (const location of ordered) {
    try {
      if (location.driver === "local") return await readFile(location.key);
      const s3 = s3Config();
      if (!s3) throw new Error("Cloud storage is not configured in this environment.");
      const res = await s3Request(s3, "GET", location.key);
      return Buffer.from(await res.arrayBuffer());
    } catch (error) {
      problems.push(`${location.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Could not read the backup file. ${problems.join("; ")}`);
}

/** Remove every stored copy. Used by retention, and by a failed backup's cleanup. */
export async function deleteBackupFile(locations: BackupLocation[]): Promise<void> {
  for (const location of locations) {
    if (!location.ok || !location.key) continue;
    try {
      if (location.driver === "local") {
        await unlink(location.key);
      } else {
        const s3 = s3Config();
        if (s3) await s3Request(s3, "DELETE", location.key);
      }
    } catch {
      // A copy that is already gone is the outcome we wanted.
    }
  }
}

// ---------------------------------------------------------------------------
// S3 request signing (SigV4)
// ---------------------------------------------------------------------------

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function objectUrl(s3: S3Config, key: string): string {
  // Keys are built from backup ids and a configured prefix, both restricted to
  // characters that need no escaping, so the key goes into the path as-is —
  // which also means the signature is computed over the same string the server
  // will canonicalise.
  if (s3.pathStyle) return `${s3.endpoint}/${s3.bucket}/${key}`;
  return `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/${key}`;
}

/**
 * One signed request to the object store.
 *
 * SigV4 by hand is a short, stable algorithm, and doing it here keeps an AWS
 * SDK (and its transitive tree) out of a Next.js server bundle for the sake of
 * three HTTP verbs. The payload hash is required in the signature, which is
 * also why `putBackupFile` works on a buffer rather than a stream.
 */
async function s3Request(
  s3: S3Config,
  method: "PUT" | "GET" | "DELETE",
  key: string,
  body?: Buffer,
  contentType?: string,
): Promise<Response> {
  const url = new URL(objectUrl(s3, key));
  const payloadHash = sha256Hex(body ?? "");
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim()}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${s3.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  let signingKey = hmac(`AWS4${s3.secretAccessKey}`, dateStamp);
  signingKey = hmac(signingKey, s3.region);
  signingKey = hmac(signingKey, "s3");
  signingKey = hmac(signingKey, "aws4_request");
  const signature = hmac(signingKey, stringToSign).toString("hex");

  const res = await fetch(url, {
    method,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${s3.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: body ? new Uint8Array(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    // The store's XML error body names the bucket and the problem; it carries
    // no credential, but trim it so a wall of XML doesn't reach the console.
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`${method} failed with ${res.status}. ${detail}`.trim());
  }
  return res;
}
