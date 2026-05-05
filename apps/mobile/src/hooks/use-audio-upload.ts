import { useMutation } from "@tanstack/react-query";
import { getAccessToken, isTokenExpired, refreshTokens } from "~/lib/auth";
import { useRecorderStore } from "~/stores/recorder-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";

type UploadInput = {
  fileUri: string;
  autoCommit: boolean;
  source: "recorder" | "file_picker" | "share_extension" | "app";
  mime?: string;
  filename?: string;
};

type UploadResult = {
  id: string;
  commit_status: "draft" | "committed";
  processing_status: "deferred" | "pending" | "processing" | "completed" | "failed";
  media_url?: string | null;
  duration_seconds?: number | null;
};

function inferMime(fileUri: string): string {
  if (fileUri.endsWith(".mp3")) return "audio/mpeg";
  if (fileUri.endsWith(".wav")) return "audio/wav";
  if (fileUri.endsWith(".webm")) return "audio/webm";
  if (fileUri.endsWith(".ogg")) return "audio/ogg";
  if (fileUri.endsWith(".flac")) return "audio/flac";
  return "audio/mp4";
}

async function resolveToken(): Promise<string | null> {
  let token = await getAccessToken();
  if (token && isTokenExpired(token)) {
    await refreshTokens();
    token = await getAccessToken();
  }
  return token;
}

export function useAudioUpload() {
  const setUploadProgress = useRecorderStore((s) => s.setUploadProgress);
  const setUploadState = useRecorderStore((s) => s.setUploadState);

  return useMutation({
    mutationFn: async (input: UploadInput): Promise<UploadResult> => {
      const mime = input.mime ?? inferMime(input.fileUri);
      const filename =
        input.filename ?? input.fileUri.split("/").pop() ?? "audio.m4a";

      const form = new FormData();
      form.append("audio", {
        uri: input.fileUri,
        name: filename,
        type: mime,
      } as unknown as Blob);
      form.append("auto_commit", String(input.autoCommit));
      form.append("source", input.source);

      const token = await resolveToken();

      setUploadState("uploading");
      setUploadProgress(0);

      const result = await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_URL}/saves`);
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("X-Platform", "mobile");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(e.loaded / e.total);
        };
        xhr.onerror = () => reject(new Error("network"));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as UploadResult);
          } else if (xhr.status === 401) {
            // Best-effort retry after a fresh token
            resolveToken().then((newToken) => {
              const retry = new XMLHttpRequest();
              retry.open("POST", `${API_URL}/saves`);
              if (newToken)
                retry.setRequestHeader("Authorization", `Bearer ${newToken}`);
              retry.setRequestHeader("X-Platform", "mobile");
              retry.upload.onprogress = (e) => {
                if (e.lengthComputable) setUploadProgress(e.loaded / e.total);
              };
              retry.onerror = () => reject(new Error("network"));
              retry.onload = () => {
                if (retry.status >= 200 && retry.status < 300) {
                  resolve(JSON.parse(retry.responseText) as UploadResult);
                } else {
                  reject(
                    new Error(
                      `status=${retry.status} body=${retry.responseText}`,
                    ),
                  );
                }
              };
              retry.send(form);
            });
          } else {
            reject(
              new Error(`status=${xhr.status} body=${xhr.responseText}`),
            );
          }
        };
        xhr.send(form);
      });

      setUploadState("done");
      setUploadProgress(1);
      return result;
    },
    onError: () => {
      setUploadState("failed");
    },
    // POST /saves is not idempotent server-side, so a TanStack-level retry
    // re-runs mutationFn and creates a duplicate content row for a single
    // user action. The 401 path inside mutationFn already covers the only
    // transient case worth retrying (stale access token).
    retry: 0,
  });
}
