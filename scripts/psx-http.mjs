import process from "node:process";

let nextRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPSX(url, options = {}, attempts = 6) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const wait = Math.max(0, nextRequestAt - Date.now());
      nextRequestAt = Date.now() + wait + 1000;
      if (wait > 0) await sleep(wait);
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        ...options,
        headers: {
          "user-agent": "kmiallshr-data-import/1.0",
          ...(options.headers ?? {}),
        },
      });

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = retryAfter > 0
          ? retryAfter * 1000
          : Math.min(15_000 * 2 ** (attempt - 1), 60_000);
        nextRequestAt = Math.max(nextRequestAt, Date.now() + delay);
        process.stdout.write(`PSX rate limit; retrying ${url} after ${delay / 1000}s\n`);
      }

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`${response.status} ${url}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(500 * attempt);
    }
  }

  throw lastError;
}

export { fetchPSX };
