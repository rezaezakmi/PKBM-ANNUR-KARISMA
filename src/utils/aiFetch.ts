export interface AiFetchOptions {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export interface AiFetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage: string | null;
}

function isTransientNetworkError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('load failed') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('connection') ||
    msg.includes('socket') ||
    msg.includes('eof')
  );
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper POST JSON yang tangguh untuk perangkat seluler (iOS Safari, Android Chrome, WebView)
 * maupun desktop: menangani timeout aman, parsing respons non-JSON (502/504 HTML gateway),
 * serta 1x retry otomatis jika sinyal HP sempat putus sementara.
 */
export async function postAiJson<T extends Record<string, unknown>>(
  url: string,
  payload: unknown,
  options: AiFetchOptions = {}
): Promise<AiFetchResult<T>> {
  const timeoutMs = options.timeoutMs ?? 95_000;
  const maxRetries = options.retries ?? 1;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      status: 0,
      data: null,
      errorMessage: 'Perangkat sedang offline. Periksa koneksi internet Anda lalu coba kembali.',
    };
  }

  let attempt = 0;
  let lastErrorMessage = 'Terjadi kendala koneksi ke server AI. Silakan coba kembali.';

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort, { once: true });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawText = await response.text();
      let parsed: T | null = null;
      if (rawText.trim()) {
        try {
          parsed = JSON.parse(rawText) as T;
        } catch {
          parsed = null;
        }
      }

      if (response.ok && parsed) {
        return {
          ok: true,
          status: response.status,
          data: parsed,
          errorMessage: null,
        };
      }

      const serverMsg =
        parsed && typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message.trim()
          : null;

      // Retry sekali untuk gangguan gateway/overload sementara (502/503/504)
      if (
        (response.status === 502 || response.status === 503 || response.status === 504) &&
        attempt < maxRetries
      ) {
        lastErrorMessage =
          serverMsg ||
          'Server AI sedang sibuk. Sistem sedang mencoba ulang otomatis...';
        attempt += 1;
        await waitMs(900);
        continue;
      }

      return {
        ok: false,
        status: response.status,
        data: parsed,
        errorMessage:
          serverMsg ||
          (response.status === 504
            ? 'Waktu tunggu server AI habis. Coba kurangi jumlah soal atau klik Generate kembali.'
            : response.status === 502 || response.status === 503
              ? 'Server AI sedang mengalami lonjakan permintaan. Silakan klik Generate kembali beberapa detik lagi.'
              : 'Gagal memproses permintaan AI dari server. Silakan coba kembali.'),
      };
    } catch (err) {
      if (options.signal?.aborted) {
        return {
          ok: false,
          status: 0,
          data: null,
          errorMessage: 'Permintaan dibatalkan.',
        };
      }

      if (timedOut) {
        lastErrorMessage =
          'Koneksi ke layanan AI melebihi batas waktu tunggu. Pastikan sinyal internet stabil lalu coba kembali.';
      } else if (isTransientNetworkError(err)) {
        lastErrorMessage =
          'Koneksi internet terputus sementara saat menghubungi server AI. Silakan coba kembali.';
      } else {
        lastErrorMessage =
          err instanceof Error && err.message
            ? err.message
            : 'Gagal terhubung ke server AI. Silakan coba kembali.';
      }

      if (attempt < maxRetries && (timedOut || isTransientNetworkError(err))) {
        attempt += 1;
        await waitMs(900);
        continue;
      }

      return {
        ok: false,
        status: 0,
        data: null,
        errorMessage: lastErrorMessage,
      };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  return {
    ok: false,
    status: 0,
    data: null,
    errorMessage: lastErrorMessage,
  };
}
